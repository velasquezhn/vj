const { normalizeAdminRole, isValidAdminRole } = require('../utils/adminRoles');

describe('roles administrativos', () => {
  test.each([
    ['superadmin', 'superadmin'],
    ['super_admin', 'superadmin'],
    ['Super Admin', 'superadmin'],
    ['admin', 'admin']
  ])('normaliza %s como %s', (input, expected) => {
    expect(normalizeAdminRole(input)).toBe(expected);
  });

  test('rechaza roles que no existen', () => {
    expect(isValidAdminRole('manager')).toBe(false);
    expect(isValidAdminRole('staff')).toBe(false);
  });
});
