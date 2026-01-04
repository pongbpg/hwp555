# SKU Formula - Quick Reference

## Formula
```
{BrandName} - {CategoryName} - {Model} - {Color} - {Size} - {Material}
```

## Examples
| Brand | Category | Model | Color | Size | Material | Generated SKU |
|-------|----------|-------|-------|------|----------|---------------|
| Nike | Shoe | AirMax90 | Black | 40 | Leather | NIKE - SHOE - AIRMAX90 - BLACK - 40 - LEATHER |
| Adidas | Apparel | Ultraboost | White | S | Polyester | ADIDAS - APPAREL - ULTRABOOST - WHITE - S - POLYESTER |
| Samsung | Electronics | Galaxy S24 | Silver | 256GB | Glass | SAMSUNG - ELECTRONICS - GALAXY S24 - SILVER - 256GB - GLASS |

## Creating a Product

### User Input
```
Product Name: Air Max 90
Brand: Nike
Category: Shoe
Variant 1:
  Model: AirMax90
  Color: Black
  Size: 40
  Material: Leather
  SKU: [Leave Empty]
```

### Auto-Generated SKU
```
NIKE - SHOE - AIRMAX90 - BLACK - 40 - LEATHER
```

## Key Points
- ✅ SKU is **auto-generated** - leave field empty
- ✅ **Model field is required** for generation
- ✅ All values are **automatically uppercase**
- ✅ Uses **full brand/category names**, not abbreviations
- ✅ **Spaces and hyphens** are preserved in format
- ✅ Can override with **custom SKU** if needed

## Files Modified
- `stock_system/backend/models/Product.js` - Model field added
- `stock_system/backend/routes/products.js` - Generation logic
- `stock_system/frontend/src/pages/Products.jsx` - UI field added

## Test
```bash
export AUTH_TOKEN="your-jwt-token"
node test-sku-formula.mjs
```

## Troubleshooting
| Issue | Solution |
|-------|----------|
| SKU shows "UNKNOWN" | Brand or Category not selected properly |
| Model field not visible | Clear browser cache, hard refresh (Cmd+Shift+R) |
| SKU not generating | Ensure model field is filled, then save |
| Old SKU format still works | Yes, system supports both formats |

---
**Status**: ✅ Production Ready
