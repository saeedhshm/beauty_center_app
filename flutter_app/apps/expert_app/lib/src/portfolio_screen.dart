import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:lamsa_catalog/lamsa_catalog.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

typedef PortfolioFilePicker = Future<PlatformFile?> Function();

class PortfolioScreen extends StatefulWidget {
  const PortfolioScreen({
    required this.workspace,
    required this.expertId,
    this.pickFile,
    this.refreshSignal,
    super.key,
  });

  final ExpertWorkspaceGateway workspace;
  final String expertId;
  final PortfolioFilePicker? pickFile;
  final Listenable? refreshSignal;

  @override
  State<PortfolioScreen> createState() => _PortfolioScreenState();
}

class _PortfolioScreenState extends State<PortfolioScreen> {
  List<PortfolioItem>? _items;
  List<ExpertService> _services = const [];
  ApiFailureKind? _failureKind;
  String? _error;
  bool _mutating = false;
  final Map<String, Future<List<int>>> _imageBytes = {};

  @override
  void initState() {
    super.initState();
    widget.refreshSignal?.addListener(_load);
    _load();
  }

  @override
  void didUpdateWidget(covariant PortfolioScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshSignal != widget.refreshSignal) {
      oldWidget.refreshSignal?.removeListener(_load);
      widget.refreshSignal?.addListener(_load);
    }
  }

  @override
  void dispose() {
    widget.refreshSignal?.removeListener(_load);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_items == null && _error == null) {
      return LamsaStatusView(
        status: LamsaStatus.loading,
        title: context.lamsa.portfolio,
        message: context.lamsa.loadingPortfolio,
      );
    }
    if (_items == null) {
      return LamsaStatusView(
        status: _failureKind == ApiFailureKind.forbidden
            ? LamsaStatus.forbidden
            : LamsaStatus.error,
        title: context.lamsa.portfolioLoadFailed,
        message: _error ?? context.lamsa.tryAgain,
        onRetry: _load,
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(LamsaSpacing.lg),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.lamsa.portfolio,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    Text(context.lamsa.portfolioCount(_items!.length, 20)),
                  ],
                ),
              ),
              FilledButton.icon(
                onPressed: _mutating || _items!.length >= 20 ? null : _upload,
                icon: _mutating
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.add_photo_alternate_outlined),
                label: Text(context.lamsa.addPortfolioImage),
              ),
            ],
          ),
          const SizedBox(height: LamsaSpacing.xs),
          Text(context.lamsa.portfolioUploadHint),
          if (_items!.length >= 20)
            Padding(
              padding: const EdgeInsets.only(top: LamsaSpacing.xs),
              child: Text(
                context.lamsa.portfolioLimitReached,
                style: const TextStyle(color: LamsaColors.warning),
              ),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: LamsaSpacing.md),
              child: Text(
                _error!,
                style: const TextStyle(color: LamsaColors.danger),
              ),
            ),
          const SizedBox(height: LamsaSpacing.lg),
          if (_items!.isEmpty)
            LamsaStatusView(
              status: LamsaStatus.empty,
              title: context.lamsa.emptyPortfolio,
              message: context.lamsa.emptyPortfolioHint,
            )
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 320,
                mainAxisExtent: 290,
                crossAxisSpacing: LamsaSpacing.md,
                mainAxisSpacing: LamsaSpacing.md,
              ),
              itemCount: _items!.length,
              itemBuilder: (context, index) => _portfolioCard(_items![index]),
            ),
        ],
      ),
    );
  }

  Widget _portfolioCard(PortfolioItem item) {
    final service = _services
        .where((entry) => entry.serviceId == item.serviceId)
        .firstOrNull;
    return LamsaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: FutureBuilder<List<int>>(
                future: _imageBytes.putIfAbsent(
                  item.id,
                  () => widget.workspace.portfolioBytes(item.url),
                ),
                builder: (context, snapshot) {
                  if (snapshot.hasData) {
                    return Image.memory(
                      Uint8List.fromList(snapshot.data!),
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => _imageFailure(),
                    );
                  }
                  if (snapshot.hasError) return _imageFailure();
                  return const Center(child: CircularProgressIndicator());
                },
              ),
            ),
          ),
          const SizedBox(height: LamsaSpacing.sm),
          Text(
            service?.name ?? context.lamsa.noAssociatedService,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: IconButton(
              tooltip: context.lamsa.deleteImage,
              onPressed: _mutating ? null : () => _confirmDelete(item),
              icon: const Icon(Icons.delete_outline),
            ),
          ),
        ],
      ),
    );
  }

  Widget _imageFailure() => Center(
    child: Semantics(
      label: context.lamsa.imageLoadFailed,
      child: const Icon(Icons.broken_image_outlined, size: 42),
    ),
  );

  Future<void> _load() async {
    setState(() {
      _error = null;
      _failureKind = null;
    });
    try {
      final results = await Future.wait([
        widget.workspace.portfolio(widget.expertId),
        widget.workspace.services(),
      ]);
      if (!mounted) {
        return;
      }
      setState(() {
        _items = results[0] as List<PortfolioItem>;
        _services = results[1] as List<ExpertService>;
      });
    } on ApiFailure catch (failure) {
      if (mounted) {
        setState(() {
          _items = null;
          _error = failure.message;
          _failureKind = failure.kind;
        });
      }
    } on Object {
      if (mounted) {
        setState(() {
          _items = null;
          _error = context.lamsa.portfolioLoadFailed;
        });
      }
    }
  }

  Future<void> _upload() async {
    try {
      final file = await (widget.pickFile?.call() ?? _pickFile());
      if (file == null) return;
      if (file.size > 5 * 1024 * 1024) {
        setState(() => _error = context.lamsa.fileTooLarge5MiB);
        return;
      }
      final extension = file.extension?.toLowerCase();
      final contentType = switch (extension) {
        'jpg' || 'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        _ => null,
      };
      if (contentType == null) {
        setState(() => _error = context.lamsa.unsupportedPortfolioFileType);
        return;
      }
      final bytes =
          file.bytes ??
          (file.path == null ? null : await File(file.path!).readAsBytes());
      if (bytes == null) {
        setState(() => _error = context.lamsa.fileReadFailed);
        return;
      }
      if (!mounted) return;
      final selection = await _selectService();
      if (!mounted || selection == null) return;
      setState(() {
        _mutating = true;
        _error = null;
      });
      final uploaded = await widget.workspace.uploadPortfolio(
        bytes: bytes,
        filename: file.name,
        contentType: contentType,
        serviceId: selection.serviceId,
      );
      if (!mounted) return;
      setState(() => _items = [...?_items, uploaded]);
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } on Object {
      if (mounted) setState(() => _error = context.lamsa.fileUploadFailed);
    } finally {
      if (mounted) setState(() => _mutating = false);
    }
  }

  Future<PlatformFile?> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp'],
      withData: true,
    );
    return result?.files.single;
  }

  Future<_ServiceSelection?> _selectService() async =>
      showDialog<_ServiceSelection>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => SimpleDialog(
          title: Text(context.lamsa.associateServiceOptional),
          children: [
            SimpleDialogOption(
              onPressed: () =>
                  Navigator.pop(dialogContext, const _ServiceSelection(null)),
              child: Text(context.lamsa.noAssociatedService),
            ),
            ..._services.map(
              (service) => SimpleDialogOption(
                onPressed: () => Navigator.pop(
                  dialogContext,
                  _ServiceSelection(service.serviceId),
                ),
                child: Text(service.name ?? context.lamsa.unavailableService),
              ),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: Text(context.lamsa.cancel),
            ),
          ],
        ),
      );

  Future<void> _confirmDelete(PortfolioItem item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(context.lamsa.deletePortfolioImageTitle),
        content: Text(context.lamsa.deletePortfolioImageMessage),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(context.lamsa.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(context.lamsa.delete),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() {
      _mutating = true;
      _error = null;
    });
    try {
      await widget.workspace.deletePortfolio(item.id);
      if (mounted) {
        setState(
          () => _items = _items!
              .where((entry) => entry.id != item.id)
              .toList(growable: false),
        );
      }
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } on Object {
      if (mounted) setState(() => _error = context.lamsa.deleteFailed);
    } finally {
      if (mounted) setState(() => _mutating = false);
    }
  }
}

class _ServiceSelection {
  const _ServiceSelection(this.serviceId);

  final int? serviceId;
}
