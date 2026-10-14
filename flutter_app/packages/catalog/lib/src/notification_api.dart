import 'package:lamsa_networking/lamsa_networking.dart';

import 'models.dart';

/// An in-app notification row. `data` carries at most a booking reference;
/// screens always refetch the booking before displaying it.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.bookingId,
    required this.readAt,
    required this.createdAt,
  });

  final String id;
  final String type;
  final String title;
  final String body;
  final String? bookingId;
  final String? readAt;
  final String createdAt;

  bool get isRead => readAt != null;

  factory AppNotification.fromJson(JsonObject json) {
    String requiredString(String key) {
      final value = json[key];
      if (value is! String) {
        throw const FormatException('Invalid API response');
      }
      return value;
    }

    String? optionalString(String key) {
      final value = json[key];
      if (value == null) return null;
      if (value is! String) {
        throw const FormatException('Invalid API response');
      }
      return value;
    }

    String? bookingId;
    final data = json['data'];
    if (data is JsonObject) {
      final raw = data['bookingId'];
      if (raw != null) {
        if (raw is! String) throw const FormatException('Invalid API response');
        bookingId = raw;
      }
    }
    return AppNotification(
      id: requiredString('id'),
      type: requiredString('type'),
      title: requiredString('title'),
      body: requiredString('body'),
      bookingId: bookingId,
      readAt: optionalString('readAt'),
      createdAt: requiredString('createdAt'),
    );
  }
}

class RegisteredDevice {
  const RegisteredDevice({required this.id, required this.createdAt});

  final String id;
  final String createdAt;

  factory RegisteredDevice.fromJson(JsonObject json) {
    final id = json['id'];
    final createdAt = json['createdAt'];
    if (id is! String || createdAt is! String) {
      throw const FormatException('Invalid API response');
    }
    return RegisteredDevice(id: id, createdAt: createdAt);
  }
}

abstract interface class NotificationGateway {
  Future<RegisteredDevice> registerDevice(String token);
  Future<List<RegisteredDevice>> devices();
  Future<void> removeDevice(String id);
  Future<CatalogPage<AppNotification>> notifications({
    bool unreadOnly = false,
    int page = 1,
  });
  Future<int> unreadCount();
  Future<void> markRead(String id);
  Future<void> markAllRead();
}

class NotificationApi implements NotificationGateway {
  NotificationApi(this._client);

  final ApiClient _client;

  @override
  Future<RegisteredDevice> registerDevice(String token) async {
    final body = await _client.post<JsonObject>(
      '/api/v1/devices',
      data: {'token': token},
      authenticated: true,
    );
    final data = body['data'];
    if (data is! JsonObject) {
      throw const FormatException('Invalid API response');
    }
    return RegisteredDevice.fromJson(data);
  }

  @override
  Future<List<RegisteredDevice>> devices() async {
    final body = await _client.get<JsonObject>(
      '/api/v1/devices',
      authenticated: true,
    );
    final data = body['data'];
    if (data is! List<Object?>) {
      throw const FormatException('Invalid API response');
    }
    return data
        .whereType<JsonObject>()
        .map(RegisteredDevice.fromJson)
        .toList(growable: false);
  }

  @override
  Future<void> removeDevice(String id) async {
    await _client.delete<Object?>('/api/v1/devices/$id', authenticated: true);
  }

  @override
  Future<CatalogPage<AppNotification>> notifications({
    bool unreadOnly = false,
    int page = 1,
  }) async {
    final body = await _client.get<JsonObject>(
      '/api/v1/notifications',
      query: {'page': page, 'unreadOnly': unreadOnly ? 'true' : 'false'},
      authenticated: true,
    );
    final data = body['data'];
    if (data is! JsonObject) {
      throw const FormatException('Invalid API response');
    }
    return CatalogPage.fromJson(data, AppNotification.fromJson);
  }

  @override
  Future<int> unreadCount() async {
    final body = await _client.get<JsonObject>(
      '/api/v1/notifications/unread-count',
      authenticated: true,
    );
    final data = body['data'];
    if (data is! JsonObject || data['unread'] is! int) {
      throw const FormatException('Invalid API response');
    }
    return data['unread'] as int;
  }

  @override
  Future<void> markRead(String id) async {
    await _client.post<Object?>(
      '/api/v1/notifications/$id/read',
      authenticated: true,
    );
  }

  @override
  Future<void> markAllRead() async {
    await _client.post<Object?>(
      '/api/v1/notifications/read-all',
      authenticated: true,
    );
  }
}
