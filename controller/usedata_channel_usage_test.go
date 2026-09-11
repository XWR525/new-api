package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type channelUsageResponse struct {
	Success bool                      `json:"success"`
	Message string                    `json:"message"`
	Data    []model.ChannelUsageTotal `json:"data"`
}

func setupChannelUsageControllerTestDB(t *testing.T) {
	t.Helper()
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.QuotaData{}))
	require.NoError(t, model.DB.Create(&model.Channel{Id: 1, Name: "east"}).Error)
	// 渠道 2 已删除：名称解析应回退为 channel-2
	require.NoError(t, model.DB.Create(&model.QuotaData{
		UserID:    1,
		Username:  "alice",
		ChannelID: 1,
		ModelName: "gpt-a",
		CreatedAt: 1100,
		Count:     2,
		Quota:     100,
		TokenUsed: 40,
	}).Error)
	require.NoError(t, model.DB.Create(&model.QuotaData{
		UserID:    1,
		Username:  "alice",
		ChannelID: 1,
		ModelName: "gpt-b",
		CreatedAt: 1200,
		Count:     3,
		Quota:     50,
		TokenUsed: 10,
	}).Error)
	require.NoError(t, model.DB.Create(&model.QuotaData{
		UserID:    2,
		Username:  "bob",
		ChannelID: 2,
		ModelName: "gpt-a",
		CreatedAt: 1200,
		Count:     7,
		Quota:     70,
		TokenUsed: 30,
	}).Error)
	// 升级前未记录渠道的历史数据必须被排除
	require.NoError(t, model.DB.Create(&model.QuotaData{
		UserID:    2,
		Username:  "bob",
		ChannelID: 0,
		ModelName: "gpt-a",
		CreatedAt: 1200,
		Count:     9,
		Quota:     900,
		TokenUsed: 900,
	}).Error)
}

func decodeChannelUsageResponse(t *testing.T, recorder *httptest.ResponseRecorder) channelUsageResponse {
	t.Helper()
	require.Equal(t, http.StatusOK, recorder.Code)
	var payload channelUsageResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
	require.True(t, payload.Success, payload.Message)
	return payload
}

func TestGetChannelUsageTotalsAggregatesByChannel(t *testing.T) {
	setupChannelUsageControllerTestDB(t)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/data/channel-usage?start_timestamp=1000&end_timestamp=2000", nil)

	GetChannelUsageTotals(ctx)

	payload := decodeChannelUsageResponse(t, recorder)
	require.Len(t, payload.Data, 2)
	require.Equal(t, 2, payload.Data[0].ChannelID)
	require.Equal(t, "channel-2", payload.Data[0].ChannelName)
	require.Equal(t, 7, payload.Data[0].Count)
	require.Equal(t, 1, payload.Data[1].ChannelID)
	require.Equal(t, "east", payload.Data[1].ChannelName)
	require.Equal(t, 5, payload.Data[1].Count)
	require.Equal(t, 150, payload.Data[1].Quota)
	require.Equal(t, 50, payload.Data[1].TokenUsed)
}

func TestGetChannelUsageTotalsFiltersByUsername(t *testing.T) {
	setupChannelUsageControllerTestDB(t)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/data/channel-usage?start_timestamp=1000&end_timestamp=2000&username=alice", nil)

	GetChannelUsageTotals(ctx)

	payload := decodeChannelUsageResponse(t, recorder)
	require.Len(t, payload.Data, 1)
	require.Equal(t, 1, payload.Data[0].ChannelID)
	require.Equal(t, "east", payload.Data[0].ChannelName)
	require.Equal(t, 5, payload.Data[0].Count)
}

func TestGetChannelUsageTotalsRespectsTimeRange(t *testing.T) {
	setupChannelUsageControllerTestDB(t)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/data/channel-usage?start_timestamp=1150&end_timestamp=2000", nil)

	GetChannelUsageTotals(ctx)

	payload := decodeChannelUsageResponse(t, recorder)
	require.Len(t, payload.Data, 2)
	require.Equal(t, 2, payload.Data[0].ChannelID)
	require.Equal(t, 7, payload.Data[0].Count)
	require.Equal(t, 1, payload.Data[1].ChannelID)
	require.Equal(t, 3, payload.Data[1].Count)
}

func TestGetChannelUsageTotalsRejectsInvalidTimeRange(t *testing.T) {
	setupChannelUsageControllerTestDB(t)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/data/channel-usage?start_timestamp=bad&end_timestamp=2000", nil)

	GetChannelUsageTotals(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var payload channelUsageResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
	require.False(t, payload.Success)
	require.Equal(t, "invalid start_timestamp", payload.Message)
}
