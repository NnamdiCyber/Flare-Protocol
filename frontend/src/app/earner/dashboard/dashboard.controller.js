/**
 * dashboard.controller.js — Earner dashboard controller.
 *
 * Displays connected wallet address, total earned, and campaigns participated.
 */

'use strict';

angular.module('flareApp.earner')
  .controller('DashboardCtrl', [
    '$scope',
    '$http',
    'WalletService',
    'AuthService',
    function ($scope, $http, WalletService, AuthService) {

      $scope.walletAddress = null;
      $scope.totalEarned = null;
      $scope.campaignsCompleted = null;
      $scope.loading = true;
      $scope.error = null;
      $scope.notConnected = false;

      var API_BASE = 'http://localhost:3000';

      // Load wallet address then fetch earner stats
      WalletService.isConnected()
        .then(function (connected) {
          if (!connected) {
            $scope.notConnected = true;
            $scope.loading = false;
            return;
          }
          return WalletService.getPublicKey();
        })
        .then(function (pubkey) {
          if (!pubkey) return;
          $scope.walletAddress = pubkey;

          // Fetch earner stats from backend (campaigns stats endpoint)
          var token = AuthService.getToken();
          var config = token ? { headers: { Authorization: 'Bearer ' + token } } : {};
          return $http.get(API_BASE + '/campaigns?earner=' + pubkey, config);
        })
        .then(function (response) {
          if (!response) return;
          // Backend returns campaign list; derive counts from response
          var campaigns = response.data || [];
          $scope.campaignsCompleted = campaigns.filter(function (c) {
            return c.participated;
          }).length;
          $scope.totalEarned = campaigns.reduce(function (sum, c) {
            return sum + (c.earnedAmount || 0);
          }, 0);
        })
        .catch(function (err) {
          $scope.error = 'Could not load dashboard data.';
          console.error('[DashboardCtrl] error:', err);
        })
        .finally(function () {
          $scope.loading = false;
        });

      /**
       * Short-form display of a Stellar address.
       *
       * @param {string} address
       * @returns {string}
       */
      $scope.truncate = function (address) {
        if (!address) return '';
        return address.slice(0, 6) + '…' + address.slice(-4);
      };
    },
  ]);
