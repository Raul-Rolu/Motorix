/// Lista de usuarios del sistema (T038, US2). Solo rol ADMIN en el backend.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../providers/users_provider.dart';
import 'user_form_screen.dart';

class UsersScreen extends StatefulWidget {
  const UsersScreen({super.key});

  @override
  State<UsersScreen> createState() => _UsersScreenState();
}

class _UsersScreenState extends State<UsersScreen> {
  @override
  void initState() {
    super.initState();
    // Carga inicial de la lista (la pantalla existe en el IndexedStack).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<UsersProvider>().recargar();
    });
  }

  Future<void> _confirmarCambioEstado(
      BuildContext context, UsersProvider provider, int id, bool activo) async {
    // Operación sensible: confirmación obligatoria (FR-013).
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(activo ? 'Reactivar usuario' : 'Desactivar usuario'),
        content: Text(activo
            ? '¿Desea reactivar esta cuenta? Volverá a poder iniciar sesión.'
            : '¿Desea desactivar esta cuenta? Perderá el acceso de inmediato.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor:
                  activo ? MotorixColores.acento : MotorixColores.error,
            ),
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(activo ? 'Reactivar' : 'Desactivar'),
          ),
        ],
      ),
    );
    if (confirmar != true) return;

    final exito = await provider.cambiarEstado(id, activo);
    if (!context.mounted) return;
    _mostrarResultado(context, exito, provider.error,
        activo ? 'Usuario reactivado.' : 'Usuario desactivado.');
  }

  void _mostrarResultado(
      BuildContext context, bool exito, String? error, String exitoMensaje) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(exito ? exitoMensaje : (error ?? 'Operación fallida.')),
        backgroundColor: exito ? MotorixColores.exito : MotorixColores.error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<UsersProvider>();

    if (provider.cargando && provider.usuarios.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (provider.error != null && provider.usuarios.isEmpty) {
      return Center(child: Text(provider.error!));
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Row(
            children: [
              Text('Usuarios',
                  style: Theme.of(context).textTheme.titleLarge),
              const Spacer(),
              ElevatedButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Nuevo usuario'),
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const UserFormScreen()),
                  );
                  if (context.mounted) {
                    context.read<UsersProvider>().recargar();
                  }
                },
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.separated(
            itemCount: provider.usuarios.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, indice) {
              final usuario = provider.usuarios[indice];
              return ListTile(
                leading: CircleAvatar(
                  backgroundColor: usuario.active
                      ? MotorixColores.exitoSuave
                      : MotorixColores.errorSuave,
                  child: Icon(
                    Icons.person,
                    color:
                        usuario.active ? MotorixColores.exito : MotorixColores.error,
                  ),
                ),
                title: Text('${usuario.fullName} (@${usuario.username})'),
                subtitle: Text('${usuario.email} · ${usuario.nombreRole}'),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: 'Editar',
                      icon: const Icon(Icons.edit_outlined),
                      onPressed: () async {
                        await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => UserFormScreen(usuario: usuario),
                          ),
                        );
                        if (context.mounted) {
                          context.read<UsersProvider>().recargar();
                        }
                      },
                    ),
                    IconButton(
                      tooltip:
                          usuario.active ? 'Desactivar' : 'Reactivar',
                      icon: Icon(
                        usuario.active
                            ? Icons.toggle_off_outlined
                            : Icons.toggle_on_outlined,
                        color: usuario.active
                            ? MotorixColores.error
                            : MotorixColores.exito,
                      ),
                      onPressed: () => _confirmarCambioEstado(
                        context,
                        provider,
                        usuario.id!,
                        !usuario.active,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

