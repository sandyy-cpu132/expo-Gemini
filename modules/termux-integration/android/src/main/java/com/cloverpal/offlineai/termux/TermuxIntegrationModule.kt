package com.cloverpal.offlineai.termux

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.InetSocketAddress
import java.net.Socket

class TermuxIntegrationModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw IllegalStateException("React Application Context is null")

    override fun definition() = ModuleDefinition {
        Name("TermuxIntegrationModule")

        // Checks if Termux is installed on the user device
        AsyncFunction("isTermuxInstalled") {
            try {
                context.packageManager.getPackageInfo("com.termux", 0)
                true
            } catch (e: PackageManager.NameNotFoundException) {
                false
            }
        }

        // Checks if RUN_COMMAND permission is granted
        AsyncFunction("hasRunCommandPermission") {
            val permission = "com.termux.permission.RUN_COMMAND"
            val result = ContextCompat.checkSelfPermission(context, permission)
            result == PackageManager.PERMISSION_GRANTED
        }

        // Probes loopback port via raw TCP Socket
        AsyncFunction("probeSocket") { host: String, port: Int, timeoutMs: Int ->
            try {
                val start = System.currentTimeMillis()
                val socket = Socket()
                socket.connect(InetSocketAddress(host, port), timeoutMs)
                socket.close()
                val latency = System.currentTimeMillis() - start
                mapOf(
                    "host" to host,
                    "port" to port,
                    "isOpen" to true,
                    "latencyMs" to latency
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

        // Executes command inside Termux via RUN_COMMAND Service Intent
        AsyncFunction("executeCommand") { options: Map<String, Any?> ->
            val executable = options["executable"] as? String ?: "/data/data/com.termux/files/usr/bin/bash"
            val argsList = options["arguments"] as? List<String> ?: emptyList()
            val background = options["background"] as? Boolean ?: true
            val sessionAction = options["sessionAction"] as? String ?: "0"

            val intent = Intent()
            intent.component = ComponentName("com.termux", "com.termux.app.RunCommandService")
            intent.action = "com.termux.RUN_COMMAND"

            intent.putExtra("com.termux.RUN_COMMAND_PATH", executable)
            if (argsList.isNotEmpty()) {
                intent.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", argsList.toTypedArray())
            }
            intent.putExtra("com.termux.RUN_COMMAND_BACKGROUND", background)
            intent.putExtra("com.termux.RUN_COMMAND_SESSION_ACTION", sessionAction)

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                mapOf(
                    "success" to true,
                    "message" to "Intent com.termux.RUN_COMMAND dispatched successfully."
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
