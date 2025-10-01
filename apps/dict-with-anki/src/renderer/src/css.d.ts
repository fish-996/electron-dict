// 这告诉 TypeScript，所有以 .module.css 结尾的文件
// 导出的都是一个对象，其键是字符串，值也是字符串。
declare module "*.module.css" {
    const classes: { [key: string]: string };
    export default classes;
}

// 如果你还使用了普通的 CSS 文件导入 (import './index.css')
// 你可以添加以下声明来避免对它们的报错
declare module "*.css" {
    const content: any;
    export default content;
}

// 同样，可以为其他样式预处理器添加声明
declare module "*.scss" {
    const classes: { [key: string]: string };
    export default classes;
}

declare module "*.sass" {
    const classes: { [key: string]: string };
    export default classes;
}
