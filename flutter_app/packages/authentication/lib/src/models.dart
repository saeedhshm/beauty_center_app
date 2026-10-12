enum AuthRole {
  customer('customer'),
  expert('expert');

  const AuthRole(this.value);

  final String value;

  static AuthRole parse(Object? value) => switch (value) {
    'customer' => AuthRole.customer,
    'expert' => AuthRole.expert,
    _ => throw const FormatException('Unsupported mobile role'),
  };
}

class AuthUser {
  const AuthUser({
    required this.id,
    required this.name,
    required this.phone,
    required this.role,
    required this.phoneVerified,
  });

  factory AuthUser.fromJson(Map<String, Object?> json) => AuthUser(
    id: json['id'] as String,
    name: json['name'] as String,
    phone: json['phone'] as String,
    role: AuthRole.parse(json['role']),
    phoneVerified: json['phoneVerified'] as bool,
  );

  final String id;
  final String name;
  final String phone;
  final AuthRole role;
  final bool phoneVerified;
}

class AuthSession {
  const AuthSession({
    required this.user,
    required this.accessToken,
    required this.refreshToken,
    required this.accessExpiresAt,
    required this.refreshExpiresAt,
  });

  factory AuthSession.fromJson(Map<String, Object?> json) => AuthSession(
    user: AuthUser.fromJson(json['user']! as Map<String, Object?>),
    accessToken: json['accessToken'] as String,
    refreshToken: json['refreshToken'] as String,
    accessExpiresAt: DateTime.parse(json['accessExpiresAt'] as String),
    refreshExpiresAt: DateTime.parse(json['refreshExpiresAt'] as String),
  );

  final AuthUser user;
  final String accessToken;
  final String refreshToken;
  final DateTime accessExpiresAt;
  final DateTime refreshExpiresAt;
}

class OtpChallenge {
  const OtpChallenge({
    required this.id,
    required this.expiresAt,
    required this.retryAfterSeconds,
    required this.deliveryMode,
  });

  factory OtpChallenge.fromJson(Map<String, Object?> json) => OtpChallenge(
    id: json['challengeId'] as String,
    expiresAt: DateTime.parse(json['expiresAt'] as String),
    retryAfterSeconds: json['retryAfterSeconds'] as int,
    deliveryMode: json['deliveryMode'] as String,
  );

  final String id;
  final DateTime expiresAt;
  final int retryAfterSeconds;
  final String deliveryMode;

  bool get isDemo => deliveryMode == 'demo';
}

enum ExpertApprovalStatus {
  pending,
  approved,
  suspended;

  static ExpertApprovalStatus parse(Object? value) => switch (value) {
    'pending' => ExpertApprovalStatus.pending,
    'approved' => ExpertApprovalStatus.approved,
    'suspended' => ExpertApprovalStatus.suspended,
    _ => throw const FormatException('Unsupported expert approval status'),
  };
}

class ExpertProfile {
  const ExpertProfile({
    required this.userId,
    required this.name,
    required this.cityId,
    required this.bio,
    required this.approvalStatus,
    required this.isAcceptingBookings,
  });

  factory ExpertProfile.fromJson(Map<String, Object?> json) => ExpertProfile(
    userId: json['userId'] as String,
    name: json['name'] as String,
    cityId: json['cityId'] as int?,
    bio: json['bio'] as String?,
    approvalStatus: ExpertApprovalStatus.parse(json['approvalStatus']),
    isAcceptingBookings: json['isAcceptingBookings'] as bool,
  );

  final String userId;
  final String name;
  final int? cityId;
  final String? bio;
  final ExpertApprovalStatus approvalStatus;
  final bool isAcceptingBookings;
}

class LaunchCity {
  const LaunchCity({required this.id, required this.name, required this.code});

  factory LaunchCity.fromJson(Map<String, Object?> json) => LaunchCity(
    id: json['id'] as int,
    name: json['name'] as String,
    code: json['code'] as String,
  );

  final int id;
  final String name;
  final String code;
}
