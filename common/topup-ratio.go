package common

import (
	"encoding/json"
	"sync"
)

var topupGroupRatio = map[string]float64{
	"default": 1,
	"vip":     1,
	"svip":    1,
}
var topupGroupRatioMutex sync.RWMutex

func TopupGroupRatio2JSONString() string {
	topupGroupRatioMutex.RLock()
	defer topupGroupRatioMutex.RUnlock()
	jsonBytes, err := json.Marshal(topupGroupRatio)
	if err != nil {
		SysError("error marshalling topup group ratio: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateTopupGroupRatioByJSONString(jsonStr string) error {
	topupGroupRatioMutex.Lock()
	defer topupGroupRatioMutex.Unlock()
	topupGroupRatio = make(map[string]float64)
	return json.Unmarshal([]byte(jsonStr), &topupGroupRatio)
}

// GetTopupGroupRatio 返回充值分组倍率。
// 本项目不做分组差异化收费，充值倍率统一固定为 1：读取层恒定返回 1。
func GetTopupGroupRatio(name string) float64 {
	return 1
}

// NormalizeTopupGroupRatioToDefault 把充值分组倍率统一归一化为 1，返回是否发生变更。
func NormalizeTopupGroupRatioToDefault() bool {
	topupGroupRatioMutex.Lock()
	defer topupGroupRatioMutex.Unlock()
	changed := false
	for key, value := range topupGroupRatio {
		if value != 1 {
			topupGroupRatio[key] = 1
			changed = true
		}
	}
	return changed
}

// GetTopupGroupRatioCopy 返回充值分组倍率的副本，供分组管理读取。
func GetTopupGroupRatioCopy() map[string]float64 {
	topupGroupRatioMutex.RLock()
	defer topupGroupRatioMutex.RUnlock()
	ratioCopy := make(map[string]float64, len(topupGroupRatio))
	for key, value := range topupGroupRatio {
		ratioCopy[key] = value
	}
	return ratioCopy
}
