/**
 * app.js — Flare Protocol AngularJS application root module.
 *
 * Declares the top-level "flareApp" module, wires all sub-modules, and
 * registers the NavCtrl controller that manages the navigation bar's
 * wallet-connect button.
 */

'use strict';

// ── Sub-module imports (each file registers its own angular.module) ──────────
require('./shared/wallet/wallet.service');
require('./shared/stellar/stellar.service');
require('./auth/auth.service');
require('./auth/auth.controller');
require('./earner/campaigns/campaigns.controller');
require('./earner/dashboard/dashboard.controller');
require('./earner/earnings/earnings.controller');
require('./advertiser/dashboard/advertiser-dashboard.controller');
require('./advertiser/create-campaign/create-campaign.controller');
require('./advertiser/analytics/analytics.controller');

// ── Route configuration ───────────────────────────────────────────────────────
require('./app.routes');

// ── Root module declaration ───────────────────────────────────────────────────
angular.module('flareApp', [
  'ui.router',
  'flareApp.wallet',
  'flareApp.stellar',
  'flareApp.auth',
  'flareApp.earner',
  'flareApp.advertiser',
]);

// ── NavCtrl — top navigation bar ─────────────────────────────────────────────
angular.module('flareApp').controller('NavCtrl', [
  '$scope',
  'WalletService',
  function ($scope, WalletService) {
    $scope.walletAddress = null;

    // Restore wallet address if already connected
    WalletService.isConnected().then(function (connected) {
      if (connected) {
        return WalletService.getPublicKey();
      }
    }).then(function (pubkey) {
      if (pubkey) {
        $scope.walletAddress = pubkey;
        $scope.$apply();
      }
    }).catch(angular.noop);

    /**
     * Trigger Freighter wallet connection flow.
     * On success, stores the public key in scope for display.
     */
    $scope.connectWallet = function () {
      WalletService.connect()
        .then(function () {
          return WalletService.getPublicKey();
        })
        .then(function (pubkey) {
          $scope.walletAddress = pubkey;
        })
        .catch(function (err) {
          console.error('[NavCtrl] Wallet connect failed:', err);
        });
    };
  },
]);
