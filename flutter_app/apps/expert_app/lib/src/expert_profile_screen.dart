import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:lamsa_authentication/lamsa_authentication.dart';
import 'package:lamsa_design_system/lamsa_design_system.dart';
import 'package:lamsa_localization/lamsa_localization.dart';
import 'package:lamsa_networking/lamsa_networking.dart';

class ExpertProfileScreen extends StatefulWidget {
  const ExpertProfileScreen({
    required this.manager,
    required this.api,
    super.key,
  });

  final SessionManager manager;
  final ExpertGateway api;

  @override
  State<ExpertProfileScreen> createState() => _ExpertProfileScreenState();
}

class _ExpertProfileScreenState extends State<ExpertProfileScreen>
    with WidgetsBindingObserver {
  final _name = TextEditingController();
  final _bio = TextEditingController();
  ExpertProfile? _profile;
  List<LaunchCity> _cities = const [];
  int? _cityId;
  bool _loading = true;
  bool _saving = false;
  bool _uploading = false;
  bool _uploadedThisSession = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _name.dispose();
    _bio.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text(context.lamsa.expertApp)),
        body: LamsaStatusView(
          status: LamsaStatus.loading,
          title: context.lamsa.expertProfile,
          message: context.lamsa.loadingSession,
        ),
      );
    }
    if (_profile == null) {
      return Scaffold(
        appBar: AppBar(title: Text(context.lamsa.expertApp)),
        body: LamsaStatusView(
          status: _error?.contains('صلاحية') ?? false
              ? LamsaStatus.forbidden
              : LamsaStatus.error,
          title: 'تعذر تحميل الملف',
          message: _error ?? 'حاولي مرة أخرى',
          onRetry: _load,
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(context.lamsa.expertApp),
        actions: [
          IconButton(
            tooltip: context.lamsa.retry,
            onPressed: _load,
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: context.lamsa.logout,
            onPressed: widget.manager.logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(LamsaSpacing.lg),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 680),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _ApprovalCard(profile: _profile!),
                  const SizedBox(height: LamsaSpacing.md),
                  if (_error != null) ...[
                    Text(
                      _error!,
                      style: const TextStyle(color: LamsaColors.danger),
                    ),
                    const SizedBox(height: LamsaSpacing.sm),
                  ],
                  LamsaCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          context.lamsa.expertProfile,
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: LamsaSpacing.md),
                        LamsaTextField(
                          label: context.lamsa.name,
                          controller: _name,
                          prefixIcon: Icons.person_outline,
                        ),
                        const SizedBox(height: LamsaSpacing.md),
                        DropdownButtonFormField<int>(
                          initialValue:
                              _cities.any((city) => city.id == _cityId)
                              ? _cityId
                              : null,
                          decoration: InputDecoration(
                            labelText: context.lamsa.city,
                            prefixIcon: const Icon(
                              Icons.location_city_outlined,
                            ),
                          ),
                          items: _cities
                              .map(
                                (city) => DropdownMenuItem(
                                  value: city.id,
                                  child: Text(city.name),
                                ),
                              )
                              .toList(growable: false),
                          onChanged: (value) => setState(() => _cityId = value),
                        ),
                        if (_cities.isEmpty) ...[
                          const SizedBox(height: LamsaSpacing.xs),
                          Text(
                            context.lamsa.noCities,
                            style: const TextStyle(color: LamsaColors.warning),
                          ),
                        ],
                        const SizedBox(height: LamsaSpacing.md),
                        LamsaTextField(
                          label: context.lamsa.bio,
                          controller: _bio,
                          maxLines: 5,
                          textCapitalization: TextCapitalization.sentences,
                          prefixIcon: Icons.notes_outlined,
                        ),
                        const SizedBox(height: LamsaSpacing.lg),
                        LamsaButton(
                          label: context.lamsa.save,
                          loading: _saving,
                          onPressed: _saving || _cityId == null ? null : _save,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: LamsaSpacing.md),
                  LamsaCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          context.lamsa.identityDocument,
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: LamsaSpacing.xs),
                        Text(context.lamsa.replaceDocumentHint),
                        if (_uploadedThisSession) ...[
                          const SizedBox(height: LamsaSpacing.sm),
                          Text(
                            context.lamsa.documentUploaded,
                            style: const TextStyle(color: LamsaColors.success),
                          ),
                        ],
                        const SizedBox(height: LamsaSpacing.md),
                        LamsaButton(
                          label: context.lamsa.chooseDocument,
                          icon: Icons.upload_file_outlined,
                          loading: _uploading,
                          onPressed: _uploading ? null : _pickAndUpload,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.api.profile(),
        widget.api.cities(),
      ]);
      final profile = results[0] as ExpertProfile;
      if (!mounted) return;
      setState(() {
        _profile = profile;
        _cities = results[1] as List<LaunchCity>;
        _cityId = profile.cityId;
        _name.text = profile.name;
        _bio.text = profile.bio ?? '';
      });
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } on Object {
      if (mounted) setState(() => _error = 'تعذر قراءة ملف الخبيرة');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.length < 2) {
      setState(() => _error = context.lamsa.invalidName);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final profile = await widget.api.updateProfile(
        name: name,
        bio: _bio.text.trim().isEmpty ? null : _bio.text.trim(),
        cityId: _cityId!,
      );
      final user = widget.manager.user!;
      widget.manager.replaceUser(
        AuthUser(
          id: user.id,
          name: profile.name,
          phone: user.phone,
          role: user.role,
          phoneVerified: user.phoneVerified,
        ),
      );
      if (!mounted) return;
      setState(() => _profile = profile);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(context.lamsa.profileUpdated)));
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickAndUpload() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
      );
      if (result == null) return;
      final file = result.files.single;
      if (file.size > 5 * 1024 * 1024) {
        setState(() => _error = 'حجم الملف يتجاوز 5MB');
        return;
      }
      final extension = file.extension?.toLowerCase();
      final contentType = switch (extension) {
        'jpg' || 'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'pdf' => 'application/pdf',
        _ => null,
      };
      if (contentType == null) {
        setState(() => _error = 'نوع الملف غير مدعوم');
        return;
      }
      final path = file.path;
      if (path == null) {
        setState(() => _error = 'تعذر قراءة الملف المختار');
        return;
      }
      setState(() {
        _uploading = true;
        _error = null;
      });
      final bytes = await File(path).readAsBytes();
      await widget.api.uploadIdentityDocument(
        bytes: bytes,
        filename: file.name,
        contentType: contentType,
      );
      if (mounted) setState(() => _uploadedThisSession = true);
    } on ApiFailure catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } on Object {
      if (mounted) setState(() => _error = 'تعذر قراءة أو رفع الملف المختار');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }
}

class _ApprovalCard extends StatelessWidget {
  const _ApprovalCard({required this.profile});

  final ExpertProfile profile;

  @override
  Widget build(BuildContext context) {
    final (icon, title, message, color) = switch (profile.approvalStatus) {
      ExpertApprovalStatus.pending => (
        Icons.schedule_rounded,
        context.lamsa.pendingApproval,
        context.lamsa.pendingApprovalMessage,
        LamsaColors.warning,
      ),
      ExpertApprovalStatus.approved => (
        Icons.verified_rounded,
        context.lamsa.approvedAccount,
        context.lamsa.approvedAccountMessage,
        LamsaColors.success,
      ),
      ExpertApprovalStatus.suspended => (
        Icons.block_rounded,
        context.lamsa.suspendedAccount,
        context.lamsa.suspendedAccountMessage,
        LamsaColors.danger,
      ),
    };
    return LamsaCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 34),
          const SizedBox(width: LamsaSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(
                    context,
                  ).textTheme.titleMedium?.copyWith(color: color),
                ),
                const SizedBox(height: LamsaSpacing.xs),
                Text(message),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
