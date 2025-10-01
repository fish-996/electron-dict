#![deny(clippy::all)]

use napi::Task;
use napi_derive::napi;
// 修正 #2：从正确的模块导入 AsyncTask
use napi::bindgen_prelude::AsyncTask;

// 修正 #1：正确的结构体名是 Mdict，而不是 MdictParser
use mdict_parser::Mdict;

// 定义返回给 JavaScript 的数据结构 (这个部分保持不变)
#[napi(object)]
pub struct MdictEntry {
  pub word: String,
  pub definition: String, // 这通常是一段 HTML
}

// --------------------------------------------------
// 异步查询任务
// --------------------------------------------------

// 1. 定义任务的结构体 (这个部分保持不变)
pub struct WordQueryTask {
  mdx_path: String,
  word_to_query: String,
}

// 2. 为任务实现 `napi::Task` trait
#[napi]
impl Task for WordQueryTask {
  type Output = Option<String>;
  type JsValue = Option<MdictEntry>;

  fn compute(&mut self) -> napi::Result<Self::Output> {
    let result: anyhow::Result<Option<String>> = (|| {
        // 修正 #1：使用正确的结构体名 Mdict
        let parser = Mdict::from_path(&self.mdx_path)?;
        let definition = parser.lookup(&self.word_to_query)?;
        Ok(definition)
    })();

    match result {
        Ok(definition) => Ok(definition),
        Err(e) => Err(napi::Error::new(napi::Status::GenericFailure, format!("Failed to query word: {}", e))),
    }
  }

  fn resolve(&mut self, _env: napi::Env, output: Self::Output) -> napi::Result<Self::JsValue> {
    match output {
      Some(definition) => Ok(Some(MdictEntry {
        word: self.word_to_query.clone(),
        definition,
      })),
      None => Ok(None),
    }
  }
}

// 3. 创建一个导出给 JS 的函数
#[napi]
// 修正 #2：直接使用导入的 AsyncTask，而不是 napi::AsyncTask
pub fn query_word_async(mdx_path: String, word: String) -> napi::Result<AsyncTask<WordQueryTask>> {
  let task = WordQueryTask {
    mdx_path,
    word_to_query: word,
  };
  // 修正 #2：直接调用 AsyncTask::new
  Ok(AsyncTask::new(task))
}

