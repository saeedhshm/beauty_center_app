import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';

import 'api_failure.dart';
import 'app_config.dart';

abstract interface class ApiAuthenticator {
  Future<String?> accessToken();

  Future<String?> refreshAccessToken({String? failedAccessToken});

  Future<void> sessionExpired();
}

class ApiClient {
  ApiClient({
    required AppConfig config,
    Dio? dio,
    ApiAuthenticator? authenticator,
  }) : _authenticator = authenticator,
       _dio =
           dio ??
           Dio(
             BaseOptions(
               baseUrl: config.apiBaseUrl,
               connectTimeout: const Duration(seconds: 10),
               sendTimeout: const Duration(seconds: 15),
               receiveTimeout: const Duration(seconds: 20),
               headers: const {'Accept': 'application/json'},
             ),
           );

  final Dio _dio;
  final ApiAuthenticator? _authenticator;

  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? query,
    CancelToken? cancelToken,
    bool authenticated = false,
  }) {
    return _request(
      method: 'GET',
      path: path,
      query: query,
      cancelToken: cancelToken,
      authenticated: authenticated,
    );
  }

  Future<T> post<T>(
    String path, {
    Object? data,
    CancelToken? cancelToken,
    bool authenticated = false,
  }) {
    return _request(
      method: 'POST',
      path: path,
      data: data,
      cancelToken: cancelToken,
      authenticated: authenticated,
    );
  }

  Future<T> patch<T>(
    String path, {
    Object? data,
    CancelToken? cancelToken,
    bool authenticated = false,
  }) {
    return _request(
      method: 'PATCH',
      path: path,
      data: data,
      cancelToken: cancelToken,
      authenticated: authenticated,
    );
  }

  Future<T> put<T>(
    String path, {
    Object? data,
    CancelToken? cancelToken,
    bool authenticated = false,
  }) {
    return _request(
      method: 'PUT',
      path: path,
      data: data,
      cancelToken: cancelToken,
      authenticated: authenticated,
    );
  }

  Future<T> delete<T>(
    String path, {
    Object? data,
    CancelToken? cancelToken,
    bool authenticated = false,
  }) {
    return _request(
      method: 'DELETE',
      path: path,
      data: data,
      cancelToken: cancelToken,
      authenticated: authenticated,
    );
  }

  Future<T> uploadBytes<T>(
    String path, {
    required String fieldName,
    required List<int> bytes,
    required String filename,
    required String contentType,
    CancelToken? cancelToken,
    bool authenticated = true,
  }) {
    return _request(
      method: 'POST',
      path: path,
      data: FormData.fromMap({
        fieldName: MultipartFile.fromBytes(
          bytes,
          filename: filename,
          contentType: MediaType.parse(contentType),
        ),
      }),
      cancelToken: cancelToken,
      authenticated: authenticated,
      canRetry: false,
    );
  }

  Future<T> _request<T>({
    required String method,
    required String path,
    Object? data,
    Map<String, dynamic>? query,
    CancelToken? cancelToken,
    bool authenticated = false,
    bool canRetry = true,
    bool retried = false,
  }) async {
    final authenticator = _authenticator;
    final token = authenticated && authenticator != null
        ? await authenticator.accessToken()
        : null;
    final headers = token == null
        ? null
        : <String, Object?>{'Authorization': 'Bearer $token'};
    try {
      final response = await _dio.request<T>(
        path,
        data: data,
        queryParameters: query,
        cancelToken: cancelToken,
        options: Options(method: method, headers: headers),
      );
      return response.data as T;
    } on DioException catch (error) {
      if (authenticated &&
          authenticator != null &&
          error.response?.statusCode == 401 &&
          retried) {
        await authenticator.sessionExpired();
      }
      if (authenticated &&
          authenticator != null &&
          error.response?.statusCode == 401 &&
          !retried) {
        final refreshed = await authenticator.refreshAccessToken(
          failedAccessToken: token,
        );
        if (refreshed == null) {
          await authenticator.sessionExpired();
        } else if (canRetry && !(cancelToken?.isCancelled ?? false)) {
          return _request<T>(
            method: method,
            path: path,
            data: data,
            query: query,
            cancelToken: cancelToken,
            authenticated: true,
            canRetry: canRetry,
            retried: true,
          );
        }
      }
      throw ApiFailure.fromDioException(error);
    }
  }
}
