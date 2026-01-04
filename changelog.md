# Changelog

## v6

- use `param_rules` for per-param validation + coercion (superseding `param_validators`, which has been removed)
  - example:
    - before: `param_validators: { id: Navgo.validators.int({ min: 1 }) }`
    - after: `param_rules: { id: { validator: Navgo.validators.int({ min: 1 }), coercer: Number } }`
