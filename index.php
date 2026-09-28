<?php
declare(strict_types=1);
const API_BASE = 'https://evc-api.turmin.com';

function demoData(): array {
    $items = [
        ['12345678', 'Parking A', 'Charger by the main entrance', 'AVAILABLE'],
        ['12345678', 'Parking B', 'Charger by the main entrance', 'CHARGING'],
        ['12345678', 'Parking C', 'Charger by the main entrance', 'FAULTED']
    ];
    $chargers = [];
    foreach ($items as $item) {
        $chargers[] = ['qr_code' => $item[0], 'name' => $item[1], 'description' => $item[2],
            'evses' => [['status' => $item[3], 'retrievedAt' => null, 'since' => null]], 'error' => null];
    }
    return ['chargers' => $chargers, 'demo' => true];
}

function apiRequest(string $path, bool $post): array {
    $context = stream_context_create(['http' => [
        'method' => $post ? 'POST' : 'GET', 'header' => "Accept: application/json\r\n",
        'timeout' => $post ? 30 : 5, 'ignore_errors' => true
    ]]);
    $body = @file_get_contents(API_BASE . $path, false, $context);
    $status = 0;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('/^HTTP\/\S+ (\d{3})/', $header, $match)) $status = (int) $match[1];
    }
    $data = is_string($body) ? json_decode($body, true) : null;
    return [$status, is_array($data) ? $data : null];
}

if (isset($_GET['action'])) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    $action = $_GET['action'];
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($action, ['chargers', 'limit', 'refresh'], true) ||
        ($action === 'refresh' ? $method !== 'POST' : $method !== 'GET')) {
        http_response_code(405);
        echo json_encode(['detail' => ['code' => 'invalid_action', 'message' => 'Unsupported request.']]);
        exit;
    }
    [$status, $data] = apiRequest($action === 'chargers' ? '/chargers' : '/chargers/live', $action === 'refresh');
    if ($action === 'chargers' && (!$data || $status < 200 || $status >= 300)) {
        echo json_encode(demoData());
        exit;
    }
    if (!$data) {
        http_response_code(503);
        echo json_encode(['detail' => ['code' => 'api_unavailable', 'message' => 'The charger API is currently unavailable.']]);
        exit;
    }
    http_response_code($status ?: 502);
    echo json_encode($data);
    exit;
}
header('Cache-Control: no-cache, must-revalidate');
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f5f7f5">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default">
<title>Kaak Charger Status</title>
<link rel="icon" type="image/x-icon" href="static/img/icons/favicon.ico?v=20260928b">
<link rel="icon" type="image/png" sizes="32x32" href="static/img/icons/favicon-32x32.png?v=20260928b">
<link rel="icon" type="image/png" sizes="16x16" href="static/img/icons/favicon-16x16.png?v=20260928b">
<link rel="apple-touch-icon" sizes="180x180" href="static/img/icons/apple-touch-icon.png?v=20260928b">
<link rel="manifest" href="static/img/icons/site.webmanifest?v=20260928b">
<link rel="stylesheet" href="static/css/app.css?v=<?=filemtime(__DIR__ . '/static/css/app.css')?>"><script src="static/js/app.js?v=<?=filemtime(__DIR__ . '/static/js/app.js')?>" defer></script>
</head>
<body>
<div class="shell">
<header class="topbar"><div class="brand"><img src="static/img/icons/android-chrome-192x192.png?v=<?=filemtime(__DIR__ . '/static/img/icons/android-chrome-192x192.png')?>" alt="" class="brand-icon" width="36" height="36"><strong>Kaak Charger Status</strong></div><div class="actions"><button id="theme-toggle" class="icon-button" type="button" aria-label="Switch theme">◐</button><button id="refresh" class="primary" type="button" disabled>↻ Live refresh</button></div></header>
<main>
<section class="dashboard" aria-label="Charger overview">
<div class="map-card"><div class="map-scroll"><div class="map"><picture><source srcset="static/img/map.webp" type="image/webp"><img src="static/img/map.png" alt="Site parking layout" width="1774" height="887" fetchpriority="high"></picture><div id="markers"></div></div></div></div>
<aside class="sidebar"><div class="card-heading"><div><h2>Charge points</h2><small id="updated" class="muted">Loading chargers…</small></div><span id="count" class="count">–</span></div><div id="charger-list" class="charger-list" aria-live="polite"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div><div class="legend"><span><i class="dot available"></i>Available</span><span><i class="dot occupied"></i>Occupied</span><span><i class="dot fault"></i>Fault</span><span><i class="dot unknown"></i>Unknown</span></div></aside>
</section><p id="demo-note" class="demo-note" hidden>Demo data is shown while the charger API is unavailable.</p>
</main><footer>Kaak Charger Status · Status may be delayed. Check the charger before parking.</footer></div><div id="toasts" class="toasts" aria-live="polite"></div>
</body></html>
