package com.ourhangout

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.google.firebase.FirebaseApp
import com.ourhangout.ai.AiModelStoragePackage
import com.ourhangout.auth.OpenRouterAuthCallbackPackage
import com.ourhangout.browser.BrowserToolPackage
import com.ourhangout.location.LocationCapturePackage
import com.ourhangout.push.PushTokenPackage

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(AiModelStoragePackage())
          add(OpenRouterAuthCallbackPackage())
          add(BrowserToolPackage())
          add(LocationCapturePackage())
          add(PushTokenPackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    FirebaseApp.initializeApp(this)
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
