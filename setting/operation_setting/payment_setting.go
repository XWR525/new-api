package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

type PaymentSetting struct {
	AmountOptions  []int           `json:"amount_options"`
	AmountDiscount map[int]float64 `json:"amount_discount"` // 充值金额对应的折扣，例如 100 元 0.9 表示 100 元充值享受 9 折优惠

	ComplianceConfirmed    bool   `json:"compliance_confirmed"`
	ComplianceTermsVersion string `json:"compliance_terms_version"`
	ComplianceConfirmedAt  int64  `json:"compliance_confirmed_at"`
	ComplianceConfirmedBy  int    `json:"compliance_confirmed_by"`
	ComplianceConfirmedIP  string `json:"compliance_confirmed_ip"`
}

const CurrentComplianceTermsVersion = "v1"

// 默认配置
var paymentSetting = PaymentSetting{
	AmountOptions:  []int{10, 20, 50, 100, 200, 500},
	AmountDiscount: map[int]float64{},
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("payment_setting", &paymentSetting)
}

func GetPaymentSetting() *PaymentSetting {
	return &paymentSetting
}

// IsPaymentComplianceConfirmed 是否已确认支付合规声明。
//
// 内部部署说明：本项目仅在公司内部使用，额度只作为成本统计口径，不进行真实收费，
// 因此不再要求确认上游的合规免责声明：本函数恒返回 true，使兑换码、手动充值、
// 邀请返利、订阅套餐、支付方式列表等不再被合规开关拦截。
// 恢复方法：还原为
//
//	return paymentSetting.ComplianceConfirmed &&
//		paymentSetting.ComplianceTermsVersion == CurrentComplianceTermsVersion
func IsPaymentComplianceConfirmed() bool {
	return true
}
