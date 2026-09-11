package service

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
)

type RetryParam struct {
	Ctx          *gin.Context
	TokenGroup   string
	ModelName    string
	RequestPath  string
	Retry        *int
	resetNextTry bool
}

func (p *RetryParam) GetRetry() int {
	if p.Retry == nil {
		return 0
	}
	return *p.Retry
}

func (p *RetryParam) SetRetry(retry int) {
	p.Retry = &retry
}

func (p *RetryParam) IncreaseRetry() {
	if p.resetNextTry {
		p.resetNextTry = false
		return
	}
	if p.Retry == nil {
		p.Retry = new(int)
	}
	*p.Retry++
}

func (p *RetryParam) ResetRetryNextTry() {
	p.resetNextTry = true
}

// CacheGetRandomSatisfiedChannel tries to get a random channel that satisfies the requirements.
// 尝试获取一个满足要求的随机渠道。
//
// For "auto" tokenGroup with cross-group Retry enabled:
// 对于启用了跨分组重试的 "auto" tokenGroup：
//
//   - Each group will exhaust all its priorities before moving to the next group.
//     每个分组会用完所有优先级后才会切换到下一个分组。
//
//   - Uses ContextKeyAutoGroupIndex to track current group index.
//     使用 ContextKeyAutoGroupIndex 跟踪当前分组索引。
//
//   - Uses ContextKeyAutoGroupRetryIndex to track the global Retry count when current group started.
//     使用 ContextKeyAutoGroupRetryIndex 跟踪当前分组开始时的全局重试次数。
//
//   - priorityRetry = Retry - startRetryIndex, represents the priority level within current group.
//     priorityRetry = Retry - startRetryIndex，表示当前分组内的优先级级别。
//
//   - When GetRandomSatisfiedChannel returns nil (priorities exhausted), moves to next group.
//     当 GetRandomSatisfiedChannel 返回 nil（优先级用完）时，切换到下一个分组。
//
// Example flow (2 groups, each with 2 priorities, RetryTimes=3):
// 示例流程（2个分组，每个有2个优先级，RetryTimes=3）：
//
//	Retry=0: GroupA, priority0 (startRetryIndex=0, priorityRetry=0)
//	         分组A, 优先级0
//
//	Retry=1: GroupA, priority1 (startRetryIndex=0, priorityRetry=1)
//	         分组A, 优先级1
//
//	Retry=2: GroupA exhausted → GroupB, priority0 (startRetryIndex=2, priorityRetry=0)
//	         分组A用完 → 分组B, 优先级0
//
//	Retry=3: GroupB, priority1 (startRetryIndex=2, priorityRetry=1)
//	         分组B, 优先级1
func CacheGetRandomSatisfiedChannel(param *RetryParam) (*model.Channel, string, error) {
	var channel *model.Channel
	var err error
	selectGroup := param.TokenGroup

	if param.TokenGroup == "auto" && len(setting.GetAutoGroups()) == 0 {
		return nil, selectGroup, errors.New("auto groups is not enabled")
	}
	// 需要依次尝试的候选分组（见 RequestCandidateGroups）；单分组场景返回 nil
	candidateGroups := resolveGroupCandidates(param)

	if len(candidateGroups) > 0 {
		// startGroupIndex: the group index to start searching from
		// startGroupIndex: 开始搜索的分组索引
		startGroupIndex := 0
		crossGroupRetry := common.GetContextKeyBool(param.Ctx, constant.ContextKeyTokenCrossGroupRetry)

		if lastGroupIndex, exists := common.GetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex); exists {
			if idx, ok := lastGroupIndex.(int); ok {
				startGroupIndex = idx
			}
		}

		for i := startGroupIndex; i < len(candidateGroups); i++ {
			autoGroup := candidateGroups[i]
			// 分组模型白名单：跳过不允许该模型的分组
			if !setting.IsModelAllowedInGroup(autoGroup, param.ModelName) {
				logger.LogDebug(param.Ctx, "Model %s is not allowed in group %s by whitelist, trying next group", param.ModelName, autoGroup)
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i+1)
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupRetryIndex, 0)
				param.SetRetry(0)
				continue
			}
			// Calculate priorityRetry for current group
			// 计算当前分组的 priorityRetry
			priorityRetry := param.GetRetry()
			// If moved to a new group, reset priorityRetry and update startRetryIndex
			// 如果切换到新分组，重置 priorityRetry 并更新 startRetryIndex
			if i > startGroupIndex {
				priorityRetry = 0
			}
			logger.LogDebug(param.Ctx, "Selecting candidate group: %s, priorityRetry: %d", autoGroup, priorityRetry)

			channel, _ = model.GetRandomSatisfiedChannel(autoGroup, param.ModelName, priorityRetry, param.RequestPath)
			if channel == nil {
				// Current group has no available channel for this model, try next group
				// 当前分组没有该模型的可用渠道，尝试下一个分组
				logger.LogDebug(param.Ctx, "No available channel in group %s for model %s at priorityRetry %d, trying next group", autoGroup, param.ModelName, priorityRetry)
				// 重置状态以尝试下一个分组
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i+1)
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupRetryIndex, 0)
				// Reset retry counter so outer loop can continue for next group
				// 重置重试计数器，以便外层循环可以为下一个分组继续
				param.SetRetry(0)
				continue
			}
			common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroup, autoGroup)
			selectGroup = autoGroup
			logger.LogDebug(param.Ctx, "Selected group: %s", autoGroup)

			// Prepare state for next retry
			// 为下一次重试准备状态
			if crossGroupRetry && priorityRetry >= common.RetryTimes {
				// Current group has exhausted all retries, prepare to switch to next group
				// This request still uses current group, but next retry will use next group
				// 当前分组已用完所有重试次数，准备切换到下一个分组
				// 本次请求仍使用当前分组，但下次重试将使用下一个分组
				logger.LogDebug(param.Ctx, "Current group %s retries exhausted (priorityRetry=%d >= RetryTimes=%d), preparing switch to next group for next retry", autoGroup, priorityRetry, common.RetryTimes)
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i+1)
				// Reset retry counter so outer loop can continue for next group
				// 重置重试计数器，以便外层循环可以为下一个分组继续
				param.SetRetry(0)
				param.ResetRetryNextTry()
			} else {
				// Stay in current group, save current state
				// 保持在当前分组，保存当前状态
				common.SetContextKey(param.Ctx, constant.ContextKeyAutoGroupIndex, i)
			}
			break
		}
	} else {
		channel, err = model.GetRandomSatisfiedChannel(param.TokenGroup, param.ModelName, param.GetRetry(), param.RequestPath)
		if err != nil {
			return nil, param.TokenGroup, err
		}
	}
	return channel, selectGroup, nil
}

// resolveGroupCandidates 返回需要依次尝试的候选分组。
// 非 auto 的单分组场景返回 nil（与旧实现一致，直达单分组查询）；
// auto 即使只有一个候选也必须走候选循环：auto 本身不是真实分组，
// 若落到单分组直达路径会以字面 "auto" 查询渠道，永远选不到渠道。
func resolveGroupCandidates(param *RetryParam) []string {
	groups := RequestCandidateGroups(param.Ctx, param.TokenGroup)
	if len(groups) == 0 {
		return nil
	}
	if param.TokenGroup != "auto" && len(groups) <= 1 {
		return nil
	}
	return groups
}

// RequestCandidateGroups 返回当前请求在选择渠道时可能用到的分组（按尝试顺序）。
//   - 令牌分组为 auto：用户可用分组 ∩ AutoGroups
//   - 令牌分组为用户主分组且用户有多个可用分组：主分组 → 附加分组依次尝试；
//     已被 GroupSpecialUsableGroup "-:" 规则吊销的分组不参与回退（与令牌鉴权的
//     可用分组校验保持同一口径，避免钉住分组被 403 而回退却能命中）
//   - 其它情况：仅该令牌分组本身
func RequestCandidateGroups(c *gin.Context, tokenGroup string) []string {
	effectiveGroups := GetUserEffectiveGroupsFromContext(c)
	if tokenGroup == "auto" {
		if autoGroups := GetUserAutoGroupMulti(effectiveGroups); len(autoGroups) > 0 {
			return autoGroups
		}
		return []string{tokenGroup}
	}
	usableGroups := GetUserEffectiveUsableGroups(effectiveGroups)
	candidates := make([]string, 0, len(effectiveGroups))
	for _, group := range effectiveGroups {
		if _, ok := usableGroups[group]; ok {
			candidates = append(candidates, group)
		}
	}
	if len(candidates) > 1 && tokenGroup == candidates[0] {
		return candidates
	}
	return []string{tokenGroup}
}

// IsModelAllowedInRequestGroups 判断模型是否被请求可能用到的任一分组白名单允许。
// 多分组用户在主分组被白名单拒绝时，仍可回退到允许该模型的附加分组；
// 单分组请求等价于只判断该分组。
func IsModelAllowedInRequestGroups(c *gin.Context, tokenGroup string, modelName string) bool {
	for _, group := range RequestCandidateGroups(c, tokenGroup) {
		if setting.IsModelAllowedInGroup(group, modelName) {
			return true
		}
	}
	return false
}
