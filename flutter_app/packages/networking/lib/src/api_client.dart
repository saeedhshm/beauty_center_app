import 'package:dio/dio.dart';

import 'api_failure.dart';
import 'app_config.dart';

class ApiClient {
  ApiClient({required AppConfig config, Dio? dio})
    : _dio =
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

  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? query,
    CancelToken? cancelToken,
  }) {
    return _request(
      () => _dio.get<T>(path, queryParameters: query, cancelToken: cancelToken),
    );
  }

  Future<T> post<T>(String path, {Object? data, CancelToken? cancelToken}) {
    return _request(
      () => _dio.post<T>(path, data: data, cancelToken: cancelToken),
    );
  }

  Future<T> patch<T>(String path, {Object? data, CancelToken? cancelToken}) {
    return _request(
      () => _dio.patch<T>(path, data: data, cancelToken: cancelToken),
    );
  }

  Future<T> delete<T>(String path, {Object? data, CancelToken? cancelToken}) {
    return _request(
      () => _dio.delete<T>(path, data: data, cancelToken: cancelToken),
    );
  }

  Future<T> _request<T>(Future<Response<T>> Function() request) async {
    try {
      final response = await request();
      return response.data as T;
    } on DioException catch (error) {
      throw ApiFailure.fromDioException(error);
    }
  }
}
