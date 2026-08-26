const fs = require('fs');
const path = require('path');

describe('páginas legales públicas', () => {
  test.each([
    ['privacy.html', 'Política de privacidad de Villas Julie'],
    ['data-deletion.html', 'Solicitud de eliminación de datos']
  ])('%s existe y contiene el encabezado esperado', (file, heading) => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain(heading);
    expect(html).toContain('+504 8939-4366');
  });
});
