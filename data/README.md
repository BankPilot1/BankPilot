# BankPilot 数据目录

## 原始数据（本地保留，不提交 Git）

- `raw/sparkov/sparkov.zip`：从 Kaggle 官方下载接口获取的完整压缩包，包含 `fraudTrain.csv`、`fraudTest.csv`。
- `raw/sparkov/fraudTrain.csv` 与 `fraudTest.csv`：解压原始文件。
- 发布页：https://www.kaggle.com/datasets/kartik2112/fraud-detection
- 官方下载入口：https://www.kaggle.com/api/v1/datasets/download/kartik2112/fraud-detection
- Sparkov 是合成信用卡数据，不是真实个人银行记录。

来源许可核对参考：Amazon Science 的 Fraud Dataset Benchmark 对这一来源标注 CC0（https://github.com/amazon-science/fraud-dataset-benchmark#data-sources）。完整来源说明与压缩包校验值保留在处理结果 metadata 中。

## 已处理数据（提交精简样本，克隆后可直接运行）

- `processed/sparkov.json`：四张源卡、连续六个月的消费样本，包含来源元数据。
- `processed/sparkov-evaluation.json`：按交易 ID 存储的欺诈评测标签，不由业务 API 返回，不能作为检测算法输入。
- `demo-config.json`：虚构国内账户、初始余额、联系人和代扣配置，与数据集区分。

重新导入（Python 3.11+，只用标准库）：

```powershell
python scripts/import-sparkov.py --date 2026-10-24 --factor 7.00
```

导入器流式读取 `fraudTest.csv`，在 2020-07 至 2020-12 中选择每个月均有数据、总笔数接近 400 的四张卡。源卡哈希用于复现映射，不向前端提供姓名、地址、生日或完整源卡号。

演示月份平移至基准日所在月及此前五个月，排除演示基准日之后的交易。原时间无明确时区，演示按上海时区解释。美元金额乘固定因子 7.00 作为人民币演示面额，不代表真实汇率；原始金额、日期、类别与交易 ID 均保留。商户统一前缀 `fraud_` 被移除，该前缀不表示欺诈。

四张来源卡不一定属于同一个人；在 BankPilot 中组合成同一虚构用户的四个账户，仅用于产品演示。数据中的卡类型也不推断为真实储蓄卡或国内信用卡。

Sparkov 不提供余额、信用卡账单或代扣授权。初始余额来自独立配置；模拟账单以演示月已导入消费计算、假设本期无还款，并非原数据集真实账单。三项代扣及每月扣费为显式标记 `demo-fixture` 的补充记录。模拟转账标记 `demo-operation`。历史消费与初始余额仍是不同快照，不能声称已经完整对账。

重新导入后重启服务。服务自动替换旧硬编码历史流水，保留已执行模拟转账、储蓄余额、代扣状态和历史任务；旧待确认任务取消，旧聊天快照清空。升级前状态备份在 `.data/`。
