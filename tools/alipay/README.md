# 支付宝 API 探针（与香港销售看板无关）

仅用于本地对接 `alipay.open.sp.oppor.page.query`，**不要上传到腾讯云看板服务器**。

```bash
cd tools/alipay
cp .env.example .env   # 编辑 ALIPAY_* 与私钥路径
source .venv/bin/activate
pip install cryptography certifi   # 首次或重建 venv 后
python3 alipay_oppor_probe.py
deactivate
```

私钥可放在项目根目录 `secrets/`（已在 .gitignore 中）。

输出样本：`tools/alipay/output/alipay_oppor_page_sample.json`
