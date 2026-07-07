# 渠道配置

渠道用于将 new-api 连接到上游 AI 服务商。

## 添加渠道

1. 进入 **渠道** 页面（`/channels`）
2. 点击 **新建渠道**
3. 选择服务商类型（如 OpenAI、Azure、Anthropic）
4. 填写必要配置：

### 必填字段

- **名称**：渠道的友好名称
- **类型**：服务商类型
- **API Key**：上游服务商的 API Key
- **Base URL**：服务商的 API 地址（不同类型有不同默认值）

### 可选字段

- **模型**：该渠道支持的模型列表（逗号分隔）
- **优先级**：优先级越高的渠道越先被尝试
- **权重**：负载均衡权重（越高分配越多流量）
- **分组**：将该渠道限定给特定用户分组使用

## 支持的服务商

| 服务商 | 类型代码 | 默认 Base URL |
|---|---|---|
| OpenAI | `openai` | `https://api.openai.com` |
| Azure OpenAI | `azure` | 按实例自定义 |
| Anthropic | `anthropic` | `https://api.anthropic.com` |
| Google AI | `google` | `https://generativelanguage.googleapis.com` |
| DeepSeek | `deepseek` | `https://api.deepseek.com` |

## 测试渠道

添加渠道后，可以通过以下方式测试：

1. 进入渠道列表
2. 点击 **测试** 按钮
3. 系统会发送一个简单请求并报告成功或失败

## 常见问题

- **401 Unauthorized**：检查 API Key 是否正确
- **404 Not Found**：检查 Base URL 是否正确
- **连接超时**：检查服务器网络连接
