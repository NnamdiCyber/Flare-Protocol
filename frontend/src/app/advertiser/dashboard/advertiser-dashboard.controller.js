/**
 * advertiser-dashboard.controller.js — Advertiser dashboard controller (stub).
 *
 * Full analytics dashboard is implemented post Day 5.
 */

'use strict';

angular.module('flareApp.advertiser', ['flareApp.stellar', 'flareApp.wallet', 'flareApp.auth'])
  .controller('AdvertiserDashCtrl', [
    '$scope',
    'WalletService',
    function ($scope, WalletService) {
      $scope.walletAddress = null;

      WalletService.isConnected()
        .then(function (connected) {
          if (connected) return WalletService.getPublicKey();
        })
        .then(function (key) {
          if (key) $scope.walletAddress = key;
        })
        .catch(angular.noop);
    },
  ]);
