export const match = (item: any, filter: any): boolean => {
  for (const key in filter) {
    const value = item[key];
    const condition = filter[key];

    if (typeof condition === "object" && condition !== null) {
      // Check for operators
      for (const operator in condition) {
        const target = condition[operator];
        switch (operator) {
          case "$eq":
            if (value !== target) return false;
            break;
          case "$ne":
            if (value === target) return false;
            break;
          case "$gt":
            if (!(value > target)) return false;
            break;
          case "$gte":
            if (!(value >= target)) return false;
            break;
          case "$lt":
            if (!(value < target)) return false;
            break;
          case "$lte":
            if (!(value <= target)) return false;
            break;
          case "$in":
            if (!Array.isArray(target) || !target.includes(value)) return false;
            break;
          case "$nin":
            if (!Array.isArray(target) || target.includes(value)) return false;
            break;
          case "$regex":
            if (typeof value !== "string" || !new RegExp(target).test(value)) return false;
            break;
          default:
            // Assuming nested object match or unknown operator (ignoring for now or treating as deep equality?)
            // For simplicity, if it's not a known operator, we might treat it as a direct comparison if the value is an object, 
            // but here we are focusing on operators. 
            // If the condition is just an object without operators, it might be a direct match.
            if (JSON.stringify(value) !== JSON.stringify(condition)) return false;
        }
      }
    } else {
      // Direct comparison
      if (value !== condition) return false;
    }
  }
  return true;
};
