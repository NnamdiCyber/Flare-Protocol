/**
 * auth.controller.js — Auth controller for wallet login UI.
 *
 * Provides $scope bindings for the login/logout buttons rendered
 * in the navigation bar and any auth-gated views.
 */

'use strict';

angular.module('flareApp.auth')
  .controller('AuthCtrl', [
    '$scope',
    '$state',
    'AuthService',
    'WalletService',
    function ($scope, $state, AuthService, WalletService) {

      $scope.isAuthenticated = AuthService.isAuthenticated();
      $scope.loading = false;
      $scope.error = null;

      /**
       * Connect Freighter wallet and complete the full auth flow.
       * On success, redirects the user to the earner campaigns view.
       */
      $scope.login = function () {
        $scope.loading = true;
        $scope.error = null;

        WalletService.connect()
          .then(function () {
            return AuthService.login();
          })
          .then(function () {
            $scope.isAuthenticated = true;
            $state.go('earner.campaigns');
          })
          .catch(function (err) {
            $scope.error = err.message || 'Authentication failed. Please try again.';
            console.error('[AuthCtrl] Login error:', err);
          })
          .finally(function () {
            $scope.loading = false;
          });
      };

      /**
       * Log out and redirect to the campaign browser (public page).
       */
      $scope.logout = function () {
        AuthService.logout();
        $scope.isAuthenticated = false;
        $state.go('earner.campaigns');
      };
    },
  ]);
