jest.mock('../db', () => ({
  runQuery: jest.fn(),
  runExecute: jest.fn(),
}));

const db = require('../db');
const service = require('../services/menuCabinTypesService');

describe('servicio de tipos de cabaña', () => {
  beforeEach(() => jest.clearAllMocks());

  test('el panel consulta tipos activos e inactivos', async () => {
    db.runQuery.mockResolvedValue([]);
    await service.loadAllCabinTypes();
    expect(db.runQuery.mock.calls[0][0]).not.toMatch(/WHERE activo = true/);
  });

  test('el menú de WhatsApp consulta únicamente tipos activos', async () => {
    db.runQuery.mockResolvedValue([]);
    await service.loadMenuCabinTypes();
    expect(db.runQuery.mock.calls[0][0]).toMatch(/WHERE activo = true/);
  });

  test('permite vaciar todas las fotografías de un tipo', async () => {
    db.runExecute.mockResolvedValue({ changes: 1 });
    await expect(service.updateCabinType('tortuga', { fotos: [] })).resolves.toBe(true);
    const [, params] = db.runExecute.mock.calls[0];
    expect(params).toContain('[]');
  });
});
