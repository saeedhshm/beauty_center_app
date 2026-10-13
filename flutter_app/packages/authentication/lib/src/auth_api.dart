import 'package:lamsa_networking/lamsa_networking.dart';

import 'models.dart';

abstract interface class AuthGateway {
  Future<OtpChallenge> requestRegistrationOtp(String phone);

  Future<AuthSession> register({
    required String phone,
    required String challengeId,
    required String otp,
    required String name,
    required String password,
    required AuthRole role,
  });

  Future<AuthSession> login({required String phone, required String password});

  Future<AuthSession> refresh(String refreshToken);

  Future<void> logout(String refreshToken);

  Future<OtpChallenge> requestPasswordOtp(String phone);

  Future<void> resetPassword({
    required String phone,
    required String challengeId,
    required String otp,
    required String newPassword,
  });
}

class AuthApi implements AuthGateway {
  AuthApi(this._client);

  final ApiClient _client;

  @override
  Future<OtpChallenge> requestRegistrationOtp(String phone) async {
    final body = await _client.post<Map<String, dynamic>>(
      '/api/v1/auth/register/otp',
      data: {'phone': phone},
    );
    return OtpChallenge.fromJson(_data(body));
  }

  @override
  Future<AuthSession> register({
    required String phone,
    required String challengeId,
    required String otp,
    required String name,
    required String password,
    required AuthRole role,
  }) async {
    final body = await _client.post<Map<String, dynamic>>(
      '/api/v1/auth/register',
      data: {
        'phone': phone,
        'challengeId': challengeId,
        'otp': otp,
        'name': name,
        'password': password,
        'role': role.value,
      },
    );
    return AuthSession.fromJson(_data(body));
  }

  @override
  Future<AuthSession> login({
    required String phone,
    required String password,
  }) async {
    final body = await _client.post<Map<String, dynamic>>(
      '/api/v1/auth/login',
      data: {'phone': phone, 'password': password},
    );
    return AuthSession.fromJson(_data(body));
  }

  @override
  Future<AuthSession> refresh(String refreshToken) async {
    final body = await _client.post<Map<String, dynamic>>(
      '/api/v1/auth/refresh',
      data: {'refreshToken': refreshToken},
    );
    return AuthSession.fromJson(_data(body));
  }

  @override
  Future<void> logout(String refreshToken) => _client.post<Object?>(
    '/api/v1/auth/logout',
    data: {'refreshToken': refreshToken},
  );

  @override
  Future<OtpChallenge> requestPasswordOtp(String phone) async {
    final body = await _client.post<Map<String, dynamic>>(
      '/api/v1/auth/password/otp',
      data: {'phone': phone},
    );
    return OtpChallenge.fromJson(_data(body));
  }

  @override
  Future<void> resetPassword({
    required String phone,
    required String challengeId,
    required String otp,
    required String newPassword,
  }) => _client.post<Object?>(
    '/api/v1/auth/password/reset',
    data: {
      'phone': phone,
      'challengeId': challengeId,
      'otp': otp,
      'newPassword': newPassword,
    },
  );
}

abstract interface class AccountGateway {
  Future<AuthUser> currentUser();

  Future<AuthUser> updateName(String name);
}

class AccountApi implements AccountGateway {
  AccountApi(this._client);

  final ApiClient _client;

  @override
  Future<AuthUser> currentUser() async {
    final body = await _client.get<Map<String, dynamic>>(
      '/api/v1/users/me',
      authenticated: true,
    );
    return AuthUser.fromJson(_data(body));
  }

  @override
  Future<AuthUser> updateName(String name) async {
    final body = await _client.patch<Map<String, dynamic>>(
      '/api/v1/users/me',
      data: {'name': name},
      authenticated: true,
    );
    return AuthUser.fromJson(_data(body));
  }
}

abstract interface class ExpertGateway {
  Future<ExpertProfile> profile();

  Future<ExpertProfile> setAcceptingBookings(bool isAcceptingBookings);

  Future<ExpertProfile> updateProfile({
    required String name,
    required String? bio,
    required int cityId,
  });

  Future<List<LaunchCity>> cities();

  Future<void> uploadIdentityDocument({
    required List<int> bytes,
    required String filename,
    required String contentType,
  });
}

class ExpertApi implements ExpertGateway {
  ExpertApi(this._client);

  final ApiClient _client;

  @override
  Future<ExpertProfile> profile() async {
    final body = await _client.get<Map<String, dynamic>>(
      '/api/v1/experts/me',
      authenticated: true,
    );
    return ExpertProfile.fromJson(_data(body));
  }

  @override
  Future<ExpertProfile> setAcceptingBookings(bool isAcceptingBookings) async {
    final body = await _client.patch<Map<String, dynamic>>(
      '/api/v1/experts/me',
      data: {'isAcceptingBookings': isAcceptingBookings},
      authenticated: true,
    );
    return ExpertProfile.fromJson(_data(body));
  }

  @override
  Future<ExpertProfile> updateProfile({
    required String name,
    required String? bio,
    required int cityId,
  }) async {
    final body = await _client.patch<Map<String, dynamic>>(
      '/api/v1/experts/me',
      data: {'name': name, 'bio': bio, 'cityId': cityId},
      authenticated: true,
    );
    return ExpertProfile.fromJson(_data(body));
  }

  @override
  Future<List<LaunchCity>> cities() async {
    final body = await _client.get<Map<String, dynamic>>('/api/v1/cities');
    final data = body['data'];
    if (data is! List) throw const FormatException('Invalid cities response');
    return data
        .map((item) => LaunchCity.fromJson(item as Map<String, Object?>))
        .toList(growable: false);
  }

  @override
  Future<void> uploadIdentityDocument({
    required List<int> bytes,
    required String filename,
    required String contentType,
  }) => _client.uploadBytes<Map<String, dynamic>>(
    '/api/v1/experts/me/identity-document',
    fieldName: 'document',
    bytes: bytes,
    filename: filename,
    contentType: contentType,
  );
}

Map<String, Object?> _data(Map<String, dynamic> envelope) {
  final data = envelope['data'];
  if (data is! Map) throw const FormatException('Invalid API response');
  return data.cast<String, Object?>();
}
