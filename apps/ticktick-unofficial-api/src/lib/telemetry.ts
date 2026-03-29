import { opentelemetry } from "@elysiajs/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { Elysia } from "elysia";

import type { AppConfig } from "./config";

export function createTelemetryPlugin(config: AppConfig) {
  if (!config.telemetry.enabled || !config.telemetry.exporterEndpoint) {
    return new Elysia({ name: "telemetry-disabled" });
  }

  return opentelemetry({
    serviceName: config.telemetry.serviceName,
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.telemetry.serviceName,
      [ATTR_SERVICE_VERSION]: config.packageVersion,
    }),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: config.telemetry.exporterEndpoint,
          headers: config.telemetry.headers,
        }),
      ),
    ],
  });
}
