# 快速入门

欢迎查阅 new-api 文档。本指南将帮助你快速上手使用 API。

## 准备工作

- 一个有效的 API Key（在 [API 密钥](/keys) 页面获取）
- 基本的 HTTP 请求知识

## 发送第一个请求

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-key" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "你好！"}]
  }'
```

## SDK 调用示例

### Python

```python
import openai

client = openai.OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="sk-your-key"
)

response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "你好！"}]
)
print(response.choices[0].message.content)
```

### JavaScript

```javascript
const response = await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-your-key'
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: '你好！' }]
  })
})
```

## 下一步

- 查看 [API 参考](/documentation/api-reference) 了解详细的接口文档
- 访问 [渠道配置](/documentation/channel-setup) 了解如何配置上游服务商
