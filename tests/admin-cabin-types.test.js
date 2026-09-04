const express = require('express');
const request = require('supertest');

jest.mock('../services/menuCabinTypesService', () => ({
  loadMenuCabinTypes: jest.fn(),
  loadAllCabinTypes: jest.fn(),
  getCabinTypeByKey: jest.fn(),
  toggleCabinType: jest.fn(),
  updateCabinType: jest.fn(),
  createCabinType: jest.fn(),
}));

const service = require('../services/menuCabinTypesService');
const router = require('../routes/adminCabinTypes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin/cabin-types', router);
  return app;
}

describe('administración de tipos de cabaña', () => {
  beforeEach(() => jest.clearAllMocks());

  test('lista tipos activos e inactivos en el panel', async () => {
    service.loadAllCabinTypes.mockResolvedValue([{ type_key: 'tortuga', activo: false }]);
    const response = await request(makeApp()).get('/admin/cabin-types');
    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ type_key: 'tortuga', activo: false });
    expect(service.loadAllCabinTypes).toHaveBeenCalledTimes(1);
  });

  test('crea un tipo válido', async () => {
    service.createCabinType.mockResolvedValue(true);
    const response = await request(makeApp()).post('/admin/cabin-types').send({
      type_key: 'familiar_2', nombre: 'Familiar', tipo: 'cabana', capacidad: 6,
      habitaciones: 2, baños: 1, precio_noche: 3500, fotos: ['https://example.com/foto.jpg'],
    });
    expect(response.status).toBe(201);
    expect(service.createCabinType).toHaveBeenCalledTimes(1);
  });

  test('rechaza claves inválidas antes de escribir en la base', async () => {
    const response = await request(makeApp()).post('/admin/cabin-types').send({
      type_key: 'Clave con espacios', nombre: 'Familiar', tipo: 'cabana', capacidad: 6, precio_noche: 3500,
    });
    expect(response.status).toBe(400);
    expect(service.createCabinType).not.toHaveBeenCalled();
  });

  test('rechaza cantidades inválidas antes de escribir en la base', async () => {
    const response = await request(makeApp()).post('/admin/cabin-types').send({
      type_key: 'familiar', nombre: 'Familiar', tipo: 'cabana', capacidad: 6,
      habitaciones: -1, baños: 1, precio_noche: 3500,
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/habitaciones/);
    expect(service.createCabinType).not.toHaveBeenCalled();
  });

  test('informa un conflicto cuando la clave ya existe', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('unique');
    error.code = 'SQLITE_CONSTRAINT';
    service.createCabinType.mockRejectedValue(error);
    const response = await request(makeApp()).post('/admin/cabin-types').send({
      type_key: 'familiar', nombre: 'Familiar', tipo: 'cabana', capacidad: 6, precio_noche: 3500,
    });
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/Ya existe/);
    consoleSpy.mockRestore();
  });
});
