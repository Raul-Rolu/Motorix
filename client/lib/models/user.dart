/// Modelo de usuario del sistema (T027, US1).
class Usuario {
  final int? id;
  final String username;
  final String email;
  final String fullName;
  final String role;
  final bool active;

  const Usuario({
    this.id,
    required this.username,
    required this.email,
    required this.fullName,
    required this.role,
    this.active = true,
  });

  factory Usuario.desdeJson(Map<String, dynamic> json) => Usuario(
        id: json['id'] as int?,
        username: json['username'] as String? ?? '',
        email: json['email'] as String? ?? '',
        fullName: json['fullName'] as String? ?? '',
        role: json['role'] as String? ?? '',
        active: json['active'] as bool? ?? true,
      );

  /// Nombre amigable del rol para la interfaz en español.
  String get nombreRole => switch (role) {
        'ADMIN' => 'Administrador',
        'RECEPTIONIST' => 'Recepcionista',
        'MECHANIC' => 'Mecánico',
        _ => role,
      };
}
