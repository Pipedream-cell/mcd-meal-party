# 规划输入与核价

完整示例在仓库 `examples/team.json`。金额统一使用整数“分”；从官方响应转写时先确认原始单位。

```json
{
  "budgetFen": 6000,
  "deliveryFeeFen": 0,
  "source": {
    "kind": "mcp",
    "storeId": "用户已选门店编号",
    "tool": "query-meals",
    "retrievedAt": "2026-10-22T04:00:00Z"
  },
  "members": [
    { "name": "成员A", "preferTags": ["热饮"], "avoidTags": ["辣"] }
  ],
  "menu": [
    {
      "id": "实际完整候选方案编号",
      "name": "官方返回的名称",
      "priceFen": 3000,
      "tags": ["热饮"],
      "knownAbsentTags": ["辣"],
      "available": true
    }
  ]
}
```

上面价格和编号是格式占位示例，不是实际报价。真实记录必须来自实时工具查询。

- `tags`：已确认具备的属性。`knownAbsentTags`：已确认不具备的属性，两者都需要有实际依据。
- 每个 `avoidTags` 都必须出现在候选的 `knownAbsentTags` 中，且不得出现在 `tags` 中，候选才会入选。未知信息导致排除，不推断安全。
- 候选必须是一份完整可售餐品或已经选齐规格的套餐。同一选项可供多人购买；若有限量、不足库存、每账户限购券，先移除或在核价时处理，本算法不支持这些共享约束。
- 保留私有的 `候选id → 官方商品编码、规格、套餐子选项` 映射以便构建 `calculate-price` 参数。规划器的 basket 不是可直接发送给官方的订单参数。
- `source` 是来源记录，不是签名验证。规划器不会自动查询门店或证明输入真实；Skill 操作者负责与工具原始结果核对。
- 不根据字面名称推断过敏原、营养值或禁忌。
- `calculate-price` 成功后单独展示官方核价结果与时间，不修改规划器输出使之伪装成原生官方报价。
