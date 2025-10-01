// @dict/app/scripts/prepare-and-build.js

import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import * as tar from 'tar';
import { fileURLToPath } from 'url'; // 导入 fileURLToPath

async function main() {
    // --- 修正部分 ---
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const appRoot = path.resolve(__dirname, "..");
    // --- 修正结束 ---

    const readerSourcePath = path.resolve(appRoot, '..', '..', 'reader');
    const tempPackDir = path.join(appRoot, 'temp_pack');
    const originalReaderPath = path.join(appRoot, 'node_modules', '@dict', 'reader');
    const backupPath = path.join(appRoot, 'node_modules', '@dict', 'reader_backup');

    try {
        // --- 1. 准备阶段 ---
        console.log('Building @dict/reader...');
        execSync('pnpm --filter @dict/reader build', { stdio: 'inherit' });

        console.log('Packing @dict/reader into a clean package...');
        fs.ensureDirSync(tempPackDir);
        execSync(`pnpm --filter @dict/reader pack --pack-destination ${tempPackDir}`, { stdio: 'inherit' });

        const tgzFile = fs.readdirSync(tempPackDir).find(f => f.endsWith('.tgz'));
        if (!tgzFile) throw new Error('Packed .tgz file not found!');

        // --- 2. 替换 node_modules ---
        console.log('Swapping workspace symlink with clean package...');
        if (fs.existsSync(originalReaderPath)) {
            // 在重命名之前，确保备份路径不存在
            if (fs.existsSync(backupPath)) {
                fs.removeSync(backupPath);
            }
            fs.renameSync(originalReaderPath, backupPath); // 备份原始符号链接
        }
        fs.ensureDirSync(originalReaderPath);

        await tar.x({
            file: path.join(tempPackDir, tgzFile),
            cwd: originalReaderPath,
            strip: 1,
        });

        // --- 3. 执行构建 ---
        console.log('\nStarting electron-vite and electron-builder...');
        execSync('pnpm -F @dict/app exec electron-vite build && pnpm -F @dict/app exec electron-builder', { stdio: 'inherit' });

    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    } finally {
        // --- 4. 清理和恢复 ---
        console.log('\nCleaning up and restoring workspace symlink...');
        fs.removeSync(tempPackDir);
        fs.removeSync(originalReaderPath); // 删除解压出来的实体目录
        if (fs.existsSync(backupPath)) {
            fs.renameSync(backupPath, originalReaderPath); // 恢复符号链接
        } else {
            // 如果备份不存在（比如第一次运行），尝试用 pnpm install 恢复
            console.log('Backup not found, running "pnpm install" to restore dependencies...');
            execSync('pnpm install --lockfile-only', { cwd: appRoot, stdio: 'inherit' });
        }
        console.log('Build process finished.');
    }
}

main();
