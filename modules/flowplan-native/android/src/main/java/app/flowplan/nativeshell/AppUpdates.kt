package app.flowplan.nativeshell

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.security.MessageDigest

/**
 * Installing an update of the APK build in the app (src/android-update.ts): the APK the app
 * downloaded into cache/flowplan-updates is checked here (package, versionCode, size, SHA-256)
 * and handed to Android's package installer through UpdateFileProvider. The installer itself
 * only accepts it when it is signed with the same key as the installed app.
 */
object AppUpdates {
  const val REQUEST_INSTALL = 0x7310
  const val REQUEST_SETTINGS = 0x7311
  private const val FOLDER = "flowplan-updates"

  fun authority(context: Context) = "${context.packageName}.flowplanupdates"

  /** The file behind a file:// address – only inside cache/flowplan-updates, and only an APK. */
  fun file(context: Context, uri: String): File? {
    val path = Uri.parse(uri).takeIf { it.scheme == "file" }?.path ?: uri.takeIf { it.startsWith("/") } ?: return null
    val folder = File(context.cacheDir, FOLDER).canonicalFile
    val file = File(path).canonicalFile
    return file.takeIf { it.parentFile == folder && it.name.endsWith(".apk") && it.isFile }
  }

  /** Whether the person allowed this app to install apps ("Install unknown apps"). */
  fun canInstall(context: Context) =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

  fun settingsIntent(context: Context) =
    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))

  /** { packageName, versionCode, size, sha256 } of the APK, or null when Android cannot read it. */
  fun inspect(context: Context, file: File): Map<String, Any>? {
    val pm = context.packageManager
    @Suppress("DEPRECATION")
    val info = (if (Build.VERSION.SDK_INT >= 33) pm.getPackageArchiveInfo(file.path, PackageManager.PackageInfoFlags.of(0))
      else pm.getPackageArchiveInfo(file.path, 0)) ?: return null
    @Suppress("DEPRECATION")
    val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        digest.update(buffer, 0, read)
      }
    }
    return mapOf(
      "packageName" to info.packageName,
      "versionCode" to code.toDouble(),
      "size" to file.length().toDouble(),
      "sha256" to digest.digest().joinToString("") { "%02x".format(it) },
    )
  }

  /** The system's installer for the APK; it answers with a result when it closes. */
  @Suppress("DEPRECATION")
  fun installIntent(context: Context, file: File): Intent {
    val uri = FileProvider.getUriForFile(context, authority(context), file)
    return Intent(Intent.ACTION_INSTALL_PACKAGE)
      .setDataAndType(uri, "application/vnd.android.package-archive")
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      .putExtra(Intent.EXTRA_RETURN_RESULT, true)
  }

  /** "installed", "cancelled" or "failed" from the installer's result. */
  fun outcome(resultCode: Int) = when (resultCode) {
    Activity.RESULT_OK -> "installed"
    Activity.RESULT_CANCELED -> "cancelled"
    else -> "failed"
  }
}

/** Its own class, so the provider does not clash with the other libraries' FileProviders. */
class UpdateFileProvider : FileProvider()
