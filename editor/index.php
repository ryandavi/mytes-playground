<?php $v = time(); ?>
<!DOCTYPE html>
<html>

<head>
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta charset="UTF-8">
	<title>Mytes Content Editor</title>
	<!-- base href makes runtime registries (which fetch "data/...") and shared assets
	     resolve from the project root. Consequence: never use <a href="#..."> for routing —
	     fragment links resolve against the base and navigate away. Routing assigns
	     location.hash from JS instead. -->
	<base href="../">
	<link rel="stylesheet" href="css/editor.css?v=<?= $v ?>">
</head>

<body class="editor-body">
	<div class="editor-loading" id="editor-loading">Loading content definitions...</div>

	<div class="editor-shell">
		<header class="editor-header">
			<div class="editor-header__title">
				<span class="icon">🛠️</span>
				<span class="text">Mytes Content Editor</span>
				<span class="editor-header__crumb" id="editor-crumb"></span>
			</div>
			<div class="editor-header__actions">
				<a href="./" title="Open the game in this tab">Open Game</a>
			</div>
		</header>

		<nav class="editor-tabs" id="editor-tabs"></nav>

		<main class="editor-main">
			<section class="editor-panel editor-rail">
				<div class="editor-panel__header">
					<span id="editor-rail-title">Records</span>
					<span id="editor-rail-count"></span>
				</div>
				<div class="editor-rail__search">
					<input type="search" id="editor-rail-search" placeholder="Filter..." autocomplete="off">
				</div>
				<div class="editor-panel__content">
					<ul class="editor-list" id="editor-rail-list"></ul>
				</div>
			</section>

			<section class="editor-panel editor-workspace">
				<div class="editor-panel__header">
					<span>Preview</span>
					<span id="editor-workspace-label"></span>
				</div>
				<div class="editor-workspace__stage-wrap" id="editor-workspace"></div>
			</section>

			<section class="editor-panel editor-inspector">
				<div class="editor-panel__header">
					<span>Inspector</span>
					<span id="editor-inspector-mode">read-only</span>
				</div>
				<div class="editor-panel__content" id="editor-inspector"></div>
			</section>
		</main>

		<footer class="editor-statusbar">
			<div class="editor-statusbar__cell editor-statusbar__cell--grow" id="editor-status">Ready</div>
			<div class="editor-statusbar__cell" id="editor-status-file"></div>
			<div class="editor-statusbar__cell" id="editor-status-schema"></div>
		</footer>
	</div>

	<!-- Shared runtime (same files the game loads — the editor must not fork these) -->
	<script src="js/Engine/Config/AppConfig.js?v=<?= $v ?>"></script>
	<script src="js/Engine/Config/SiteConfig.js?v=<?= $v ?>"></script>
	<script src="js/Utility/Utility.js?v=<?= $v ?>"></script>
	<script src="js/Engine/SpriteAnimator.js?v=<?= $v ?>"></script>
	<script src="js/Myte/MyteDefinitions.js?v=<?= $v ?>"></script>
	<!-- Editor -->
	<script src="editor/js/EditorApi.js?v=<?= $v ?>"></script>
	<script src="editor/js/EditorDocument.js?v=<?= $v ?>"></script>
	<script src="editor/js/EditorStore.js?v=<?= $v ?>"></script>
	<script src="editor/js/EditorRouter.js?v=<?= $v ?>"></script>
	<script src="editor/js/panels/ListRailPanel.js?v=<?= $v ?>"></script>
	<script src="editor/js/panels/InspectorPanel.js?v=<?= $v ?>"></script>
	<script src="editor/js/preview/PreviewControls.js?v=<?= $v ?>"></script>
	<script src="editor/js/preview/MytePreview.js?v=<?= $v ?>"></script>
	<script src="editor/js/preview/MapObjectPreview.js?v=<?= $v ?>"></script>
	<script src="editor/js/preview/ItemPreview.js?v=<?= $v ?>"></script>
	<script src="editor/js/preview/SummaryPreview.js?v=<?= $v ?>"></script>
	<script src="editor/js/EditorApp.js?v=<?= $v ?>"></script>
</body>

</html>
