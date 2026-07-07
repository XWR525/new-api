# API 参考

本文档介绍可用的 API 接口。

## 对话补全（Chat Completions）

创建一个对话补全。

```
POST /v1/chat/completions
```

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `model` | string | 是 | 要使用的模型名称 |
| `messages` | array | 是 | 消息对象数组 |
| `temperature` | number | 否 | 采样温度（0-2） |
| `max_tokens` | integer | 否 | 最大生成 Token 数 |
| `stream` | boolean | 否 | 启用流式响应 |

### 消息对象

| 字段 | 类型 | 说明 |
|---|---|---|
| `role` | string | `system`（系统）、`user`（用户）或 `assistant`（助手） |
| `content` | string | 消息内容 |

### 响应示例

```
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-3.5-turbo",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！有什么可以帮助你的吗？"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

## 文本补全（Completions）

旧版文本补全接口。

```
POST /v1/completions
```

## 嵌入向量（Embeddings）

为文本输入创建嵌入向量。

```
POST /v1/embeddings
```

## 模型列表

获取可用模型列表。

```
GET /v1/models
```
