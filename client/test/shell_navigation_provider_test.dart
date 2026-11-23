// 007-notificaciones-internas, T055 (US6; FR-007, CA-7): el proveedor de
// navegación del shell guarda la sección pedida desde un aviso hasta que el
// shell la atiende (la consume).
import 'package:flutter_test/flutter_test.dart';
import 'package:motorix_client/providers/shell_navigation_provider.dart';

void main() {
  test('no hay solicitud al empezar', () {
    expect(ShellNavigationProvider().solicitada, isNull);
  });

  test('solicitar guarda la sección y avisa a quien escucha (el shell)', () {
    final proveedor = ShellNavigationProvider();
    var avisos = 0;
    proveedor.addListener(() => avisos++);

    proveedor.solicitar(SeccionShell.inventario);

    expect(proveedor.solicitada, SeccionShell.inventario);
    expect(avisos, 1);
  });

  test('consumir devuelve la solicitud y la limpia sin volver a notificar', () {
    final proveedor = ShellNavigationProvider()..solicitar(SeccionShell.citas);
    var avisos = 0;
    proveedor.addListener(() => avisos++);

    expect(proveedor.consumir(), SeccionShell.citas);
    expect(proveedor.solicitada, isNull);
    expect(proveedor.consumir(), isNull);
    expect(avisos, 0);
  });

  test('una solicitud nueva reemplaza a la anterior', () {
    final proveedor = ShellNavigationProvider()
      ..solicitar(SeccionShell.citas)
      ..solicitar(SeccionShell.inventario);

    expect(proveedor.consumir(), SeccionShell.inventario);
  });
}
