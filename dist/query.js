export const match = (filter, callback) => {
    return (item, index) => {
        // 1. Check Filter
        if (filter) {
            for (const key in filter) {
                const value = item[key];
                const condition = filter[key];
                if (typeof condition === "object" && condition !== null) {
                    // Check for operators
                    for (const operator in condition) {
                        const target = condition[operator];
                        switch (operator) {
                            case "$eq":
                                if (value !== target)
                                    return false;
                                break;
                            case "$ne":
                                if (value === target)
                                    return false;
                                break;
                            case "$gt":
                                if (!(value > target))
                                    return false;
                                break;
                            case "$gte":
                                if (!(value >= target))
                                    return false;
                                break;
                            case "$lt":
                                if (!(value < target))
                                    return false;
                                break;
                            case "$lte":
                                if (!(value <= target))
                                    return false;
                                break;
                            case "$in":
                                if (!Array.isArray(target) || !target.includes(value))
                                    return false;
                                break;
                            case "$nin":
                                if (!Array.isArray(target) || target.includes(value))
                                    return false;
                                break;
                            case "$regex":
                                if (typeof value !== "string" || !new RegExp(target).test(value))
                                    return false;
                                break;
                            default:
                                if (JSON.stringify(value) !== JSON.stringify(condition))
                                    return false;
                        }
                    }
                }
                else {
                    // Direct comparison
                    if (value !== condition)
                        return false;
                }
            }
        }
        // 2. Check Callback
        if (callback) {
            if (!callback(item))
                return false;
        }
        return true;
    };
};
