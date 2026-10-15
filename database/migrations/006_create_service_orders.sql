-- T002: tabla de órdenes de servicio (Sprint 2, US2–US7).
-- RN-2: vehículo NOT NULL con FK; RN-3: kilometraje de entrada NOT NULL;
-- RN-4: mileage_correction guarda la constancia de la corrección explícita;
-- previous_state sostiene la pausa ESPERANDO_REFACCION (research D3).

CREATE TABLE IF NOT EXISTS service_orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id INT UNSIGNED NOT NULL,
  vehicle_id INT UNSIGNED NOT NULL,
  mechanic_id INT UNSIGNED NULL,
  status ENUM('RECIBIDO','DIAGNOSTICO','EN_REPARACION','ESPERANDO_REFACCION','TERMINADO','ENTREGADO','CANCELADA') NOT NULL DEFAULT 'RECIBIDO',
  previous_state VARCHAR(20) NULL,
  mileage_entry INT UNSIGNED NOT NULL,
  mileage_correction TINYINT(1) NOT NULL DEFAULT 0,
  reason VARCHAR(255) NOT NULL,
  notes VARCHAR(255) NULL,
  cancellation_reason VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_client FOREIGN KEY (client_id) REFERENCES clients (id),
  CONSTRAINT fk_orders_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles (id),
  CONSTRAINT fk_orders_mechanic FOREIGN KEY (mechanic_id) REFERENCES users (id),
  CONSTRAINT fk_orders_creator FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_orders_vehicle ON service_orders (vehicle_id);
CREATE INDEX idx_orders_mechanic ON service_orders (mechanic_id, status);
CREATE INDEX idx_orders_status ON service_orders (status);
