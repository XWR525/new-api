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

type usageSummaryResponse struct {
	Success bool                    `json:"success"`
	Message string                  `json:"message"`
	Data    model.TotalUsageSummary `json:"data"`
}

func setupUsageSummaryControllerTestDB(t *testing.T) {
	t.Helper()
	setupModelListControllerTestDB(t)
	require.NoError(t, model.DB.Create(&model.User{
		Username:     "alice",
		AffCode:      "aff-alice",
		UsedQuota:    120,
		RequestCount: 3,
	}).Error)
	require.NoError(t, model.DB.Create(&model.User{
		Username:     "bob",
		AffCode:      "aff-bob",
		UsedQuota:    80,
		RequestCount: 7,
	}).Error)
}

func TestGetTotalUsageSummarySumsAllUsers(t *testing.T) {
	setupUsageSummaryControllerTestDB(t)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/data/summary", nil)

	GetTotalUsageSummary(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var payload usageSummaryResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
	require.True(t, payload.Success, payload.Message)
	require.Equal(t, int64(200), payload.Data.UsedQuota)
	require.Equal(t, int64(10), payload.Data.RequestCount)
}

func TestGetTotalUsageSummaryReturnsZerosWhenNoUsers(t *testing.T) {
	setupModelListControllerTestDB(t)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/data/summary", nil)

	GetTotalUsageSummary(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)
	var payload usageSummaryResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
	require.True(t, payload.Success, payload.Message)
	require.Equal(t, int64(0), payload.Data.UsedQuota)
	require.Equal(t, int64(0), payload.Data.RequestCount)
}
