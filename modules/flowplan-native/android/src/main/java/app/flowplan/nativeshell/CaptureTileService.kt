package app.flowplan.nativeshell

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Quick Settings: "New note" opens the app's capture screen (flowplan://capture). */
class CaptureTileService : TileService() {
  override fun onStartListening() {
    super.onStartListening()
    qsTile?.apply {
      state = Tile.STATE_INACTIVE
      updateTile()
    }
  }

  override fun onClick() {
    super.onClick()
    if (isLocked) unlockAndRun { open() } else open()
  }

  private fun open() {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("flowplan://capture?mode=note"))
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(PendingIntent.getActivity(this, 0x7300, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }
}
