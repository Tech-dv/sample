/* =====================================================
   ROLE-BASED ACCESS MIDDLEWARE
===================================================== */
const allowRoles = (allowedRoles) => {
  return (req, res, next) => {
    const role = req.headers["x-user-role"];

    if (!role) {
      return res.status(403).json({ message: "Role missing" });
    }

    // SUPER_ADMIN has access to everything EXCEPT what's explicitly in allowedRoles
    // If allowedRoles doesn't include SUPER_ADMIN, they are denied access
    if (role === "SUPER_ADMIN" && !allowedRoles.includes("SUPER_ADMIN")) {
      return res.status(403).json({ message: "Access denied" });
    }

    // SUPER_ADMIN can access if they are in allowedRoles
    if (role === "SUPER_ADMIN" && allowedRoles.includes("SUPER_ADMIN")) {
      return next();
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
};

/* =====================================================
   CUSTOMER CONTEXT MIDDLEWARE
===================================================== */
const withCustomerContext = (req, res, next) => {
  const role = req.headers["x-user-role"];
  const customerId = req.headers["x-customer-id"];

  if (role === "CUSTOMER") {
    if (!customerId) {
      return res.status(403).json({ message: "Customer identity missing" });
    }
    req.customerId = Number(customerId);
  }

  next();
};

module.exports = {
  allowRoles,
  withCustomerContext,
};
