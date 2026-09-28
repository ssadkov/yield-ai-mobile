package com.walletavailability

import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WalletAvailabilityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WalletAvailability")

    AsyncFunction("isWalletInstalled") { packageName: String ->
      val packageManager = appContext.reactContext?.packageManager
        ?: return@AsyncFunction false
      try {
        packageManager.getPackageInfo(packageName, 0)
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("canResolveScheme") { scheme: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("$scheme://"))
      intent.resolveActivity(context.packageManager) != null
    }

    AsyncFunction("openUrlInPackage") { url: String, packageName: String, clearTask: Boolean ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is not available")
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
        setPackage(packageName)
        addCategory(Intent.CATEGORY_BROWSABLE)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (clearTask) {
          addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK)
        }
      }

      if (intent.resolveActivity(context.packageManager) == null) {
        throw IllegalArgumentException("No activity found for $packageName")
      }

      context.startActivity(intent)
    }
  }
}
