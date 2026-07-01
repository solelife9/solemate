source 'https://rubygems.org'

# You may use http://rbenv.org/ or https://rvm.io/ to install and use this version
ruby ">= 2.6.10"

# Exclude problematic versions of cocoapods and activesupport that causes build failures.
gem 'cocoapods', '>= 1.13', '!= 1.15.0', '!= 1.15.1'
gem 'activesupport', '>= 6.1.7.5', '!= 7.1.0'
# Xcode 16+ 동기화 폴더 그룹(PBXFileSystemSynchronizedRootGroup — RunActivity/워치 타깃이 사용)을
# 파싱하려면 xcodeproj 1.27.0+ 필요. 프로젝트 objectVersion 도 그에 맞는 표준값 77(Xcode 16.0)로 정렬.
gem 'xcodeproj', '>= 1.27.0'
gem 'concurrent-ruby', '< 1.3.4'

# Ruby 3.4.0 has removed some libraries from the standard library.
gem 'bigdecimal'
gem 'logger'
gem 'benchmark'
gem 'mutex_m'
gem 'nkf'
