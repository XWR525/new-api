package ratio_setting

import (
	"errors"
	"maps"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/types"
)

var defaultGroupRatio = map[string]float64{
	"default": 1,
	"vip":     1,
	"svip":    1,
}

var groupRatioMap = types.NewRWMap[string, float64]()

var defaultGroupGroupRatio = map[string]map[string]float64{
	"vip": {
		"edit_this": 0.9,
	},
}

var groupGroupRatioMap = types.NewRWMap[string, map[string]float64]()

var defaultGroupSpecialUsableGroup = map[string]map[string]string{
	"vip": {
		"append_1":   "vip_special_group_1",
		"-:remove_1": "vip_removed_group_1",
	},
}

type GroupRatioSetting struct {
	GroupRatio              *types.RWMap[string, float64]            `json:"group_ratio"`
	GroupGroupRatio         *types.RWMap[string, map[string]float64] `json:"group_group_ratio"`
	GroupSpecialUsableGroup *types.RWMap[string, map[string]string]  `json:"group_special_usable_group"`
}

var groupRatioSetting GroupRatioSetting

func init() {
	groupSpecialUsableGroup := types.NewRWMap[string, map[string]string]()
	groupSpecialUsableGroup.AddAll(defaultGroupSpecialUsableGroup)

	groupRatioMap.AddAll(defaultGroupRatio)
	groupGroupRatioMap.AddAll(defaultGroupGroupRatio)

	groupRatioSetting = GroupRatioSetting{
		GroupSpecialUsableGroup: groupSpecialUsableGroup,
		GroupRatio:              groupRatioMap,
		GroupGroupRatio:         groupGroupRatioMap,
	}

	config.GlobalConfig.Register("group_ratio_setting", &groupRatioSetting)
}

func GetGroupRatioSetting() *GroupRatioSetting {
	if groupRatioSetting.GroupSpecialUsableGroup == nil {
		groupRatioSetting.GroupSpecialUsableGroup = types.NewRWMap[string, map[string]string]()
		groupRatioSetting.GroupSpecialUsableGroup.AddAll(defaultGroupSpecialUsableGroup)
	}
	return &groupRatioSetting
}

func GetGroupRatioCopy() map[string]float64 {
	return groupRatioMap.ReadAll()
}

func ContainsGroupRatio(name string) bool {
	_, ok := groupRatioMap.Get(name)
	return ok
}

func GroupRatio2JSONString() string {
	return groupRatioMap.MarshalJSONString()
}

func UpdateGroupRatioByJSONString(jsonStr string) error {
	return types.LoadFromJsonString(groupRatioMap, jsonStr)
}

// GetGroupRatio 返回分组倍率。
// 本项目不做分组差异化收费，分组倍率统一固定为 1：读取层恒定返回 1，
// 因此任何配置（API、数据库直改、脚本）都无法影响计费。
func GetGroupRatio(name string) float64 {
	return 1
}

// GetGroupGroupRatio 返回跨组倍率。
// 分组倍率统一为 1，跨组倍率不再生效，恒定返回未命中。
func GetGroupGroupRatio(userGroup, usingGroup string) (float64, bool) {
	return -1, false
}

// NormalizeGroupRatiosToDefault 把分组倍率统一归一化为 1，并清空跨组倍率表。
// 保留 GroupRatio 的分组键（分组集合以它作为权威来源），仅把值改写为 1。
// 返回是否发生了变更。
func NormalizeGroupRatiosToDefault() bool {
	changed := false
	for name, ratio := range groupRatioMap.ReadAll() {
		if ratio != 1 {
			groupRatioMap.Set(name, 1)
			changed = true
		}
	}
	if groupGroupRatioMap.Len() > 0 {
		groupGroupRatioMap.Clear()
		changed = true
	}
	return changed
}

func GroupGroupRatio2JSONString() string {
	return groupGroupRatioMap.MarshalJSONString()
}

// GetGroupGroupRatioMapCopy 返回跨分组倍率表的深拷贝，供分组管理读改写。
// 必须深拷贝内层 map：调用方会对其做 delete，浅拷贝会改到全局活对象上。
func GetGroupGroupRatioMapCopy() map[string]map[string]float64 {
	source := groupGroupRatioMap.ReadAll()
	copied := make(map[string]map[string]float64, len(source))
	for group, ratios := range source {
		copied[group] = maps.Clone(ratios)
	}
	return copied
}

// GetGroupGroupRatioByUserGroup 返回某用户组使用其它分组的倍率表。
func GetGroupGroupRatioByUserGroup(userGroup string) map[string]float64 {
	ratios, ok := groupGroupRatioMap.Get(userGroup)
	if !ok {
		return nil
	}
	ratioCopy := make(map[string]float64, len(ratios))
	for key, value := range ratios {
		ratioCopy[key] = value
	}
	return ratioCopy
}

// GetGroupSpecialUsableGroupCopy 返回组间特殊可用性配置的深拷贝。
// 同样必须深拷贝内层 map：调用方会对其做 delete。
func GetGroupSpecialUsableGroupCopy() map[string]map[string]string {
	setting := GetGroupRatioSetting()
	if setting.GroupSpecialUsableGroup == nil {
		return nil
	}
	source := setting.GroupSpecialUsableGroup.ReadAll()
	copied := make(map[string]map[string]string, len(source))
	for group, entries := range source {
		copied[group] = maps.Clone(entries)
	}
	return copied
}

// GetGroupSpecialUsableGroup 返回某用户组的特殊可用性配置（含 -: / +: 前缀语义）。
func GetGroupSpecialUsableGroup(userGroup string) map[string]string {
	setting := GetGroupRatioSetting()
	if setting.GroupSpecialUsableGroup == nil {
		return nil
	}
	values, ok := setting.GroupSpecialUsableGroup.Get(userGroup)
	if !ok {
		return nil
	}
	result := make(map[string]string, len(values))
	for key, value := range values {
		result[key] = value
	}
	return result
}

func UpdateGroupGroupRatioByJSONString(jsonStr string) error {
	return types.LoadFromJsonString(groupGroupRatioMap, jsonStr)
}

func CheckGroupRatio(jsonStr string) error {
	checkGroupRatio := make(map[string]float64)
	if err := common.UnmarshalJsonStr(jsonStr, &checkGroupRatio); err != nil {
		return err
	}
	for name, ratio := range checkGroupRatio {
		if ratio < 0 {
			return errors.New("group ratio must be not less than 0: " + name)
		}
	}
	return nil
}
