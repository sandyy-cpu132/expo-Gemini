package com.cloverpal.offlineai.termux

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.InetSocketAddress
import java.net.Socket

class TermuxIntegrationModule : Module() {

    private val context
        get() = appContext.reactContext
            ?: throw IllegalStateException("React application context is null")

    override fun definition() = ModuleDefinition {
        Name("TermuxIntegrationModule")

        AsyncFunction("isTermuxInstalled") {
            try {
                context.packageManager.getPackageInfo("com.termux", 0)
                true
            } catch (e: PackageManager.NameNotFoundException) {
                false
            }
        }

        AsyncFunction("hasRunCommandPermission") {
            ContextCompat.checkSelfPermission(
                context,
                "com.termux.permission.RUN_COMMAND"
            ) == PackageManager.PERMISSION_GRANTED
        }

        AsyncFunction("probeSocket") { host: String, port: Int, timeoutMs: Int ->
            val start = System.currentTimeMillis()
            try {
                Socket().use { socket ->
                    socket.connect(InetSocketAddress(host, port), timeoutMs)
                }
                mapOf(
                    "host" to host,
                    "port" to port,
                    "isOpen" to true,
                    "latencyMs" to (System.currentTimeMillis() - start).toInt()
                )
            } catch (e: Exception) {
                mapOf(
                    "host" to host,
                    "port" to port,
                    "isOpen" to false,
                    "latencyMs" to null,
                    "error" to (e.message ?: "Connection refused")
                )
            }
        }

        AsyncFunction("executeCommand") { options: Map<String, Any?> ->
            val executable = options["executable"] as? String
                ?: "/data/data/com.termux/files/usr/bin/bash"
            val args = (options["arguments"] as? List<*>)?.map { it.toString() } ?: emptyList()
            val background = options["background"] as? Boolean ?: true
            val sessionAction = options["sessionAction"] as? String ?: "0"

            val intent = Intent("com.termux.RUN_COMMAND").apply {
                component = ComponentName("com.termux", "com.termux.app.RunCommandService")
                putExtra("com.termux.RUN_COMMAND_PATH", executable)
                putExtra("com.termux.RUN_COMMAND_ARGUMENTS", args.toTypedArray())
                putExtra("com.termux.RUN_COMMAND_BACKGROUND", background)
                putExtra("com.termux.RUN_COMMAND_SESSION_ACTION", sessionAction)
            }

            try {
                // Termux's RunCommandService is an ordinary service. startForegroundService
                // would require a startForeground() call and can crash the app.
                context.startService(intent)
                mapOf(
                    "success" to true,
                    "message" to "Intent com.termux.RUN_COMMAND dispatched."
                )
            } catch (e: SecurityException) {
                mapOf(
                    "success" to false,
                    "message" to "Permission denied. Grant com.termux.permission.RUN_COMMAND and set allow-external-apps=true in Termux."
                )
            } catch (e: ActivityNotFoundException) {
                mapOf(
                    "success" to false,
                    "message" to "Termux RunCommandService not found. Is Termux installed?"
                )
            } catch (e: Exception) {
                mapOf(
                    "success" to false,
                    "message" to (e.message ?: "Failed to start Termux RunCommandService")
                )
            }
        }
    }
}
