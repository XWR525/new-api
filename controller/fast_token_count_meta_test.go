package controller

// fastTokenCountMetaForPricing 的映射测试：
// 入口计费只在 MaxTokens 层面做"快速元数据"，不执行完整 tokenizer 计数。
// 钉住三类文本 DTO（OpenAI chat / OpenAI Responses / Claude）的 max_tokens 映射规则，
// 以及未知类型/空请求的兜底行为——防止将来改动悄悄改变预估上限。

import (
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func uintPtr(v uint) *uint { return &v }

func TestFastTokenCountMetaForPricing_Mapping(t *testing.T) {
	cases := []struct {
		name     string
		request  dto.Request
		wantMax  int
		wantType types.TokenType
	}{
		{
			name:     "nil request yields empty meta",
			request:  nil,
			wantMax:  0,
			wantType: "",
		},
		{
			name:     "openai chat max_tokens only",
			request:  &dto.GeneralOpenAIRequest{MaxTokens: uintPtr(4096)},
			wantMax:  4096,
			wantType: types.TokenTypeTokenizer,
		},
		{
			name:     "openai chat max_completion_tokens dominates",
			request:  &dto.GeneralOpenAIRequest{MaxTokens: uintPtr(1000), MaxCompletionTokens: uintPtr(9000)},
			wantMax:  9000,
			wantType: types.TokenTypeTokenizer,
		},
		{
			name:     "openai chat max_tokens dominates",
			request:  &dto.GeneralOpenAIRequest{MaxTokens: uintPtr(8192), MaxCompletionTokens: uintPtr(4096)},
			wantMax:  8192,
			wantType: types.TokenTypeTokenizer,
		},
		{
			name:     "openai chat equal fields",
			request:  &dto.GeneralOpenAIRequest{MaxTokens: uintPtr(5000), MaxCompletionTokens: uintPtr(5000)},
			wantMax:  5000,
			wantType: types.TokenTypeTokenizer,
		},
		{
			name:     "openai chat no limits",
			request:  &dto.GeneralOpenAIRequest{},
			wantMax:  0,
			wantType: types.TokenTypeTokenizer,
		},
		{
			name:     "openai responses max_output_tokens",
			request:  &dto.OpenAIResponsesRequest{MaxOutputTokens: uintPtr(7000)},
			wantMax:  7000,
			wantType: types.TokenTypeTokenizer,
		},
		{
			name:     "openai responses no limit",
			request:  &dto.OpenAIResponsesRequest{},
			wantMax:  0,
			wantType: types.TokenTypeTokenizer,
		},
		{
			name:     "claude max_tokens",
			request:  &dto.ClaudeRequest{MaxTokens: uintPtr(6000)},
			wantMax:  6000,
			wantType: types.TokenTypeTokenizer,
		},
		{
			name:     "unknown request type falls back to empty meta",
			request:  &dto.EmbeddingRequest{},
			wantMax:  0,
			wantType: types.TokenTypeTokenizer,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			meta := fastTokenCountMetaForPricing(tc.request)
			require.NotNil(t, meta)
			assert.Equal(t, tc.wantMax, meta.MaxTokens)
			assert.Equal(t, tc.wantType, meta.TokenType)
		})
	}
}
