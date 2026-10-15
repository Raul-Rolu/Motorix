/**
 * Configuración de Jest para el backend en ES Modules.
 * Las suites de integración y contrato se ejecutan contra la base `motorix_test`,
 * nunca contra la base principal (Principio VII de la constitución).
 */
export default {
  testEnvironment: 'node',
  // Los módulos nativos de Node no requieren transformación; ESM se maneja con
  // --experimental-vm-modules (ver el script "test" de package.json).
  transform: {},
  testTimeout: 20000,
  verbose: true,
};
