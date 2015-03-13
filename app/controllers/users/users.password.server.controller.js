'use strict';

/**
 * Module dependencies.
 */
var _ = require('lodash'),
	errorHandler = require('../errors'),
	mongoose = require('mongoose'),
	passport = require('passport'),
	User = mongoose.model('User'),
	config = require('../../config'),
	nodemailer = require('nodemailer'),
	async = require('async'),
	crypto = require('crypto');

//var smtpTransport = nodemailer.createTransport(config.mailer.options);
var smtpTransport = nodemailer.createTransport();

/**
 * Forgot for reset password (forgot POST)
 */
exports.forgot = function(req, res, next) {
	async.waterfall([
		// Generate random token
		function(done) {
			crypto.randomBytes(20, function(err, buffer) {
				var token = buffer.toString('hex');
				done(err, token);
			});
		},
		// Lookup user by username
		function(token, done) {
			if (req.body.username) {
				User.findOne({
					username: req.body.username
				}, '-salt -password', function(err, user) {
	            	if (err){
	                    return res.status(400).send({errors:[err]});
	            	}
	                if (!user) {
	                    return res.status(400).send({errorId:'ERROR_NO_USER_WITH_THIS_EMAIL'});
//							message: 'No account with that username has been found'
					} else if (user.provider !== 'local') {
						return res.status(400).send({
							message: 'It seems like you signed up using your ' + user.provider + ' account'
						});
					} else {
						user.resetPasswordToken = token;
						user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

						user.save(function(err) {
							done(err, token, user);
						});
					}
				});
			} else {
				return res.status(400).send({
					message: 'Username field must not be blank'
				});
			}
		},
		function(token, user, done) {
			res.render('templates/reset-password-email', {
				name: user.displayName,
				appName: config.app.title,
				url: 'http://' + req.headers.host + '/auth/reset/' + token
			}, function(err, emailHTML) {
				done(err, emailHTML, user);
			});
		},
		// If valid email, send reset email using service
		function(emailHTML, user, done) {
            console.log('emailhtml', emailHTML);
			var mailOptions = {
				to: user.email,
				from: config.mailer.from,
				subject: 'Password Reset',
				html: emailHTML
			};
            smtpTransport.sendMail(mailOptions, function(err) {
                done(err, 'done');
            });
        }
    ], function(err) {
        if (err){
            res.status(400).send({errors:[err]});
        }else{
            res.send({});
        }
    });
};

/**
 * Reset password GET from email token
 */
exports.validateResetToken = function(req, res) {
	User.findOne({
		resetPasswordToken: req.params.token,
		resetPasswordExpires: {
			$gt: Date.now()
		}
	}, function(err, user) {
		if (!user) {
			return res.redirect('/#!/password/reset/invalid');
		}

		res.redirect('/#!/password/reset/' + req.params.token);
	});

};

/**
 * Reset password POST from email token
 */
exports.reset = function(req, res, next) {
    // Init Variables
    var passwordDetails = req.body;

    async.waterfall([

        function(done) {
            User.findOne({
                resetPasswordToken: req.params.token,
                resetPasswordExpires: {
                    $gt: Date.now()
                }
            }, function(err, user) {
                if (err){
                    return res.status(400).send({errors:[err]});
                }
                if (!user) {
                    return res.status(400).send({errorId:'ERROR_RESET_TOKEN_INVALID'});
                }
                if (!err && user) {
                    if (passwordDetails.newPassword === passwordDetails.verifyPassword) {
                        user.password = passwordDetails.newPassword;
                        user.resetPasswordToken = undefined;
                        user.resetPasswordExpires = undefined;

                        user.save(function(err) {
                            if (err) {
                                return res.status(400).send(errorHandler.getReturnError(err));
                            } else {
                                req.login(user, function(err) {
                                    if (err) {
                                        res.status(400).send({errors:[err]});
                                    } else {
                                        // Return authenticated user
                                        res.jsonp(user);
                                        done(err, user);
                                    }
                                });
                            }
                        });
                    } else {
						return res.status(400).send({
							message: 'Passwords do not match'
						});
					}
				}
			});
		},
		function(user, done) {
			res.render('templates/reset-password-confirm-email', {
				name: user.displayName,
				appName: config.app.title
			}, function(err, emailHTML) {
				done(err, emailHTML, user);
			});
		},
		// If valid email, send reset email using service
		function(emailHTML, user, done) {
			var mailOptions = {
				to: user.email,
				from: config.mailer.from,
				subject: 'Your password has been changed',
				html: emailHTML
			};

			smtpTransport.sendMail(mailOptions, function(err) {
				done(err, 'done');
			});
		}
    ], function(err) {
        if (err){
            res.send(400, {errors:[err]});
        }
    });
};

/**
 * Change Password
 */
exports.changePassword = function(req, res) {
	// Init Variables
	var passwordDetails = req.body;

	if (req.user) {
		if (passwordDetails.newPassword) {
			User.findById(req.user.id, function(err, user) {
				if (!err && user) {
					if (user.authenticate(passwordDetails.currentPassword)) {
						if (passwordDetails.newPassword === passwordDetails.verifyPassword) {
							user.password = passwordDetails.newPassword;

							user.save(function(err) {
								if (err) {
									return res.status(400).send(errorHandler.getReturnError(err));
								} else {
									req.login(user, function(err) {
										if (err) {
                                            res.send(400, {errors:[err]});
										} else {
											res.send({});
										}
									});
								}
							});
						} else {
							res.status(400).send({errorId: 'ERROR_CONFIRM_PASSWORD'});
						}
					} else {
						res.status(400).send({errorId: 'ERROR_CURRENT_PASSWORD'});
					}
				} else {
					res.status(400).send({errorId: 'ERROR_USER_NOT_FOUND'});
				}
			});
		} else {
			res.status(400).send({errorId: 'ERROR_NEW_PASSWORD'});
		}
	} else {
        res.status(400).send({errorId: 'ERROR_USER_NOT_SIGNIN'});
	}
};