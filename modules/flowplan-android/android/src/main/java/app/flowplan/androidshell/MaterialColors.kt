package app.flowplan.androidshell

import android.content.Context
import android.os.Build

/**
 * The system's Material You palette (Android 12+: from the wallpaper or the chosen theme), as
 * hex colours for the home screen widgets, which react-native-android-widget draws from
 * colour values, not resources (the tones src/android/theme.ts maps to its roles). null before
 * Android 12.
 */
object MaterialColors {
  fun palette(context: Context): Map<String, String>? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
    val tones = mapOf(
      "accent1_200" to android.R.color.system_accent1_200,
      "accent1_600" to android.R.color.system_accent1_600,
      "accent2_50" to android.R.color.system_accent2_50,
      "accent2_100" to android.R.color.system_accent2_100,
      "accent2_800" to android.R.color.system_accent2_800,
      "neutral1_50" to android.R.color.system_neutral1_50,
      "neutral1_900" to android.R.color.system_neutral1_900,
      "neutral2_200" to android.R.color.system_neutral2_200,
      "neutral2_700" to android.R.color.system_neutral2_700,
    )
    return try {
      tones.mapValues { (_, id) -> String.format("#%06X", 0xFFFFFF and context.getColor(id)) }
    } catch (_: Exception) {
      null
    }
  }
}
