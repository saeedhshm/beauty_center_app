import 'package:dio/dio.dart';

enum ApiFailureKind {
  badRequest,
  validation,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  rateLimited,
  offline,
  timeout,
  server,
  payloadTooLarge,
  unsupportedMedia,
  unknown,
}

class ApiFailure implements Exception {
  const ApiFailure({
    required this.kind,
    required this.code,
    required this.message,
    this.statusCode,
    this.requestId,
    this.fields = const {},
    this.retryAfterSeconds,
  });

  factory ApiFailure.fromDioException(DioException exception) {
    if (exception.type == DioExceptionType.connectionTimeout ||
        exception.type == DioExceptionType.sendTimeout ||
        exception.type == DioExceptionType.receiveTimeout) {
      return const ApiFailure(
        kind: ApiFailureKind.timeout,
        code: 'TIMEOUT',
        message: 'استغرق الاتصال وقتًا أطول من المتوقع',
      );
    }
    if (exception.type == DioExceptionType.connectionError) {
      return const ApiFailure(
        kind: ApiFailureKind.offline,
        code: 'NETWORK_UNAVAILABLE',
        message: 'تعذر الاتصال بالخادم',
      );
    }
    if (exception.type == DioExceptionType.cancel) {
      return const ApiFailure(
        kind: ApiFailureKind.unknown,
        code: 'REQUEST_CANCELLED',
        message: 'أُلغي الطلب',
      );
    }

    final response = exception.response;
    final status = response?.statusCode;
    final data = response?.data;
    final body = data is Map ? data : const <String, Object?>{};
    final rawError = body['error'];
    final error = rawError is Map ? rawError : const <String, Object?>{};
    final rawFields = error['fields'];
    final fields = <String, List<String>>{};
    if (rawFields is Map) {
      for (final entry in rawFields.entries) {
        if (entry.key is String && entry.value is List) {
          fields[entry.key as String] = (entry.value as List)
              .whereType<String>()
              .toList(growable: false);
        }
      }
    }
    return ApiFailure(
      kind: _kindFor(status),
      code: error['code'] is String
          ? error['code'] as String
          : 'REQUEST_FAILED',
      message: error['message'] is String
          ? error['message'] as String
          : 'تعذر إكمال الطلب',
      statusCode: status,
      requestId: body['requestId'] is String
          ? body['requestId'] as String
          : null,
      fields: fields,
      retryAfterSeconds: int.tryParse(
        response?.headers.value('retry-after') ?? '',
      ),
    );
  }

  final ApiFailureKind kind;
  final String code;
  final String message;
  final int? statusCode;
  final String? requestId;
  final Map<String, List<String>> fields;
  final int? retryAfterSeconds;

  static ApiFailureKind _kindFor(int? status) => switch (status) {
    400 => ApiFailureKind.badRequest,
    401 => ApiFailureKind.unauthorized,
    403 => ApiFailureKind.forbidden,
    404 => ApiFailureKind.notFound,
    409 => ApiFailureKind.conflict,
    422 => ApiFailureKind.validation,
    429 => ApiFailureKind.rateLimited,
    413 => ApiFailureKind.payloadTooLarge,
    415 => ApiFailureKind.unsupportedMedia,
    int value when value >= 500 => ApiFailureKind.server,
    _ => ApiFailureKind.unknown,
  };

  @override
  String toString() => 'ApiFailure($code, $statusCode)';
}
