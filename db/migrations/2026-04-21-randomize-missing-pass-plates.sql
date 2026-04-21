UPDATE pass_requests
SET
  vehicle_plate = CONCAT('ZZ-', LPAD(MOD(id * 97, 1000), 3, '0'), '-', LPAD(id, 6, '0')),
  vehicle_plate_normalized = CONCAT('ZZ', LPAD(MOD(id * 97, 1000), 3, '0'), LPAD(id, 6, '0'))
WHERE (vehicle_plate IS NULL OR TRIM(vehicle_plate) = '');
